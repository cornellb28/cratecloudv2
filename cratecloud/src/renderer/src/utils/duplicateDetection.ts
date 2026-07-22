import type { Track } from '../types/track'

// Pure edit/format descriptors that don't change a track's identity — safe to
// strip entirely. Deliberately does NOT include "remix"/"edit" alone, since
// "Song (Kenji Rō Remix)" and "Song (Pari S Remix)" are different tracks, not
// duplicates — only strip when the descriptor carries no distinguishing name.
const NOISE_DESCRIPTORS = [
  'clean', 'explicit', 'radio edit', 'original mix', 'extended', 'extended mix',
  'album version', 'instrumental',
]

const NOISE_PATTERN = new RegExp(
  `[([]\\s*(${NOISE_DESCRIPTORS.join('|')})\\s*[)\\]]`,
  'gi'
)

// feat./featuring/ft. clauses are stripped for matching only (never displayed) —
// in practice these are usually tagging inconsistency rather than a genuinely
// different release, though this is the one rule most likely to cause an
// occasional false positive.
const FEAT_PATTERN = /\(?\s*(feat\.?|featuring|ft\.?)\s+[^()[\]]*\)?/gi

function normalizeForMatch(raw: string): string {
  let s = raw.toLowerCase().trim()
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  s = s.replace(FEAT_PATTERN, ' ')
  s = s.replace(NOISE_PATTERN, ' ')
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function matchKey(track: Track): string {
  return `${normalizeForMatch(track.artist ?? '')}|||${normalizeForMatch(track.title ?? '')}`
}

// Groups tracks sharing a normalized artist+title key into clusters (2+ tracks).
// Tracks with no usable artist/title are skipped — nothing meaningful to key on.
export function findDuplicateClusters(tracks: Track[]): Track[][] {
  const groups = new Map<string, Track[]>()

  for (const t of tracks) {
    if (!t.title?.trim() || !t.artist?.trim()) continue
    const key = matchKey(t)
    if (key === '|||') continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  return [...groups.values()].filter((cluster) => cluster.length > 1)
}

export function pairKey(idA: number, idB: number): string {
  const a = Math.min(idA, idB)
  const b = Math.max(idA, idB)
  return `${a}-${b}`
}

// No bitrate field exists anywhere in the schema/analysis pipeline — this is
// a rough estimate derived from size/duration, not read from the file.
export function estimateBitrateKbps(track: Track): number | null {
  if (!track.file_size_mb || !track.duration_sec) return null
  const bits = track.file_size_mb * 1024 * 1024 * 8
  const kbps = bits / track.duration_sec / 1000
  return Math.round(kbps)
}
