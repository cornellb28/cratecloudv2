import { createHash } from 'crypto'
import { readFile, stat, open } from 'fs/promises'
import { probeFile } from './audioSidecar'
import { relinkTrackFilepath, markTracksMissing, type DbTrackRow } from './db'

const PARTIAL_HASH_PROBE_BYTES = 65536

// Cheap fingerprint: sha256 of a 64KB slice ~40% into the file. Deliberately
// avoids full-file hashing (would freeze on large libraries) and avoids
// parsing ID3v2/APEv2/MP4 metadata containers (exactly what CrateCloud's own
// tag writeback mutates) by staying away from the head/tail of the file.
// Captured once at import time so it's still available for comparison after
// the file itself has gone missing — recomputing it later isn't possible.
export async function computePartialHash(filepath: string): Promise<string | null> {
  try {
    const { size } = await stat(filepath)
    if (size <= PARTIAL_HASH_PROBE_BYTES) {
      const buf = await readFile(filepath)
      return createHash('sha256').update(buf).digest('hex')
    }
    const offset = Math.floor(size * 0.4)
    const fh = await open(filepath, 'r')
    try {
      const buf = Buffer.alloc(PARTIAL_HASH_PROBE_BYTES)
      await fh.read(buf, 0, PARTIAL_HASH_PROBE_BYTES, offset)
      return createHash('sha256').update(buf).digest('hex')
    } finally {
      await fh.close()
    }
  } catch {
    return null
  }
}

export async function getLastModified(filepath: string): Promise<number | null> {
  try {
    return Math.floor((await stat(filepath)).mtimeMs / 1000)
  } catch {
    return null
  }
}

export type ReconcileCandidate = { filepath: string; size: number; duration: number | null }

// Matches "missing" tracks (known to the DB, no longer found at their stored
// path) against newly-discovered candidate files by size -> duration probe
// -> partial_hash, applying relinks/missing-flags directly. Shared between
// the manual rescan handler (index.ts) and the live filesystem watcher
// (libraryWatcher.ts) so both use one matching implementation instead of two
// that could quietly disagree.
export async function reconcileCandidates(
  missing: DbTrackRow[],
  candidates: ReconcileCandidate[]
): Promise<{ relinked: number; stillMissing: number; relinkedIds: number[] }> {
  if (!candidates.length) {
    markTracksMissing(missing.map((t) => t.id))
    return { relinked: 0, stillMissing: missing.length, relinkedIds: [] }
  }

  let relinkedCount = 0
  const relinkedIds: number[] = []
  const stillMissingIds: number[] = []

  for (const track of missing) {
    const expectedBytes = track.file_size_mb != null ? track.file_size_mb * 1024 * 1024 : null
    // file_size_mb was rounded to 2dp on import — allow a small tolerance
    const sizeMatches = expectedBytes == null
      ? []
      : candidates.filter((c) => Math.abs(c.size - expectedBytes) < 1024 * 50)

    let matched: ReconcileCandidate | null = null

    if (sizeMatches.length === 1) {
      matched = sizeMatches[0]
    } else if (sizeMatches.length > 1) {
      // Ambiguous on size alone — probe duration (cheap: mutagen header
      // read, no audio decode) for just the tied candidates.
      for (const c of sizeMatches) {
        if (c.duration == null) {
          const probe = await probeFile(c.filepath)
          c.duration = probe.success ? (probe.duration_sec ?? null) : null
        }
      }
      const durationMatches = sizeMatches.filter(
        (c) => c.duration != null && track.duration_sec != null && Math.abs(c.duration - track.duration_sec) < 0.5
      )
      if (durationMatches.length === 1) {
        matched = durationMatches[0]
      } else if (durationMatches.length > 1 && track.partial_hash) {
        // Still tied — break with the fingerprint captured at import time.
        // Only possible for tracks imported after partial_hash existed;
        // older rows without one simply can't be disambiguated this way.
        for (const c of durationMatches) {
          const h = await computePartialHash(c.filepath)
          if (h && h === track.partial_hash) { matched = c; break }
        }
      }
      // Still ambiguous → fall through and leave it missing rather than guess.
    }

    if (matched) {
      candidates.splice(candidates.indexOf(matched), 1) // one file can't resolve two missing tracks
      relinkTrackFilepath(track.id, matched.filepath)
      relinkedCount++
      relinkedIds.push(track.id)
    } else {
      stillMissingIds.push(track.id)
    }
  }

  if (stillMissingIds.length) markTracksMissing(stillMissingIds)
  return { relinked: relinkedCount, stillMissing: stillMissingIds.length, relinkedIds }
}
