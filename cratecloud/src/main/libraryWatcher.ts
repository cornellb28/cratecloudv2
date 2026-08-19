import { watch, type FSWatcher } from 'chokidar'
import { extname, basename, dirname } from 'path'
import { stat } from 'fs/promises'
import { BrowserWindow } from 'electron'
import {
  getAllTracks, getTrackById, getFolders, insertTracks, renameFolderWithCascade,
  type DbTrackRow, type DbTrackInsert,
} from './db'
import { reconcileCandidates, type ReconcileCandidate } from './reconcile'

// Live filesystem watching for registered library_roots — additive to, not
// a replacement for, the manual "Rescan Library" flow (library:rescanFolder
// / reconcileCandidates in index.ts).
//
// chokidar has no 'rename' event — a move/rename shows up as an independent,
// uncorrelated unlink(oldPath) + add(newPath) (or unlinkDir/addDir for
// folders). Events are buffered per root for DEBOUNCE_MS and, on flush,
// matched using the same size/duration/partial_hash logic the manual rescan
// uses (see reconcile.ts) — this is what tells a real rename apart from an
// unrelated delete + unrelated new file. That buffering is also what keeps a
// burst of hundreds of 'add' events (e.g. copying a folder in) from
// producing hundreds of separate DB writes/notifications.

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])
const DEBOUNCE_MS = 500

type PendingEvents = {
  adds: Set<string>
  unlinks: Set<string>
  addDirs: Set<string>
  unlinkDirs: Set<string>
  timer: NodeJS.Timeout | null
}

function emptyPending(): PendingEvents {
  return { adds: new Set(), unlinks: new Set(), addDirs: new Set(), unlinkDirs: new Set(), timer: null }
}

type WatcherEntry = {
  watcher: FSWatcher
  rootPath: string
  // Guards flush() against overlapping runs on the same root — a burst of
  // events arriving while a previous flush's async matching (hashing/
  // probing) is still in flight gets folded into the next cycle instead of
  // racing it.
  reconciling: boolean
  pending: PendingEvents
}

const watchers = new Map<number, WatcherEntry>() // library_root id -> entry

// Only descend into directories unconditionally (chokidar needs to see them
// to find audio files within); for files, ignore anything that isn't an
// audio file so a watched root's event log isn't drowned in .DS_Store /
// temp-file noise. Not filesystem-wide — the caller only ever passes a
// single library_root's path as the watch root (see startWatcher below).
function isIgnored(path: string, stats?: { isDirectory(): boolean }): boolean {
  if (!stats) return false // chokidar's own pre-stat matching pass — never pre-emptively exclude
  if (stats.isDirectory()) return false
  return !AUDIO_EXTENSIONS.has(extname(path).toLowerCase())
}

function sendToRenderer(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, payload)
}

function scheduleFlush(rootId: number): void {
  const entry = watchers.get(rootId)
  if (!entry) return
  if (entry.pending.timer) clearTimeout(entry.pending.timer)
  entry.pending.timer = setTimeout(() => { void flush(rootId) }, DEBOUNCE_MS)
}

async function flush(rootId: number): Promise<void> {
  const entry = watchers.get(rootId)
  if (!entry) return

  if (entry.reconciling) {
    // Previous flush still running — don't drop this cycle's events, retry shortly.
    entry.pending.timer = setTimeout(() => { void flush(rootId) }, DEBOUNCE_MS)
    return
  }

  const { adds, unlinks, addDirs, unlinkDirs } = entry.pending
  entry.pending = emptyPending()
  if (!adds.size && !unlinks.size && !addDirs.size && !unlinkDirs.size) return

  entry.reconciling = true
  try {
    // ── Folders: only auto-correlate the unambiguous 1 unlinkDir / 1 addDir
    // case — anything more (e.g. a renamed folder with subfolders, which
    // itself fires nested unlinkDir/addDir pairs) is left for a manual
    // Rescan Library rather than guessed at. ──
    let handledOldDir: string | null = null
    let handledNewDir: string | null = null
    if (unlinkDirs.size === 1 && addDirs.size === 1) {
      const [oldPath] = unlinkDirs
      const [newPath] = addDirs
      const folder = getFolders().find((f) => f.path === oldPath)
      if (folder) {
        const libraryRootIdToSync =
          folder.root_folder_id != null && folder.parent_folder_id === null ? folder.root_folder_id : null
        renameFolderWithCascade(folder.id, basename(newPath), { old: oldPath, new: newPath, libraryRootIdToSync })
        handledOldDir = oldPath
        handledNewDir = newPath
        sendToRenderer('watcher:folderRenamed', { folderId: folder.id })
      }
    }

    // File events that are just fallout from a folder rename we already
    // handled above are already reflected in the DB (cascadeFolderPaths
    // updated every track underneath) — drop them so they aren't also
    // processed as an independent delete/add below.
    const fileUnlinks = [...unlinks].filter(
      (p) => !handledOldDir || !(p === handledOldDir || p.startsWith(handledOldDir + '/'))
    )
    const fileAdds = [...adds].filter(
      (p) => !handledNewDir || !(p === handledNewDir || p.startsWith(handledNewDir + '/'))
    )

    // ── Files: match unlinks against adds the same way the manual rescan
    // does, so a plain rename/move never produces a false "missing" +
    // false "new file" pair. ──
    const allTracks = fileUnlinks.length ? getAllTracks() : []
    const missing: DbTrackRow[] = fileUnlinks
      .map((p) => allTracks.find((t) => t.filepath === p))
      .filter((t): t is DbTrackRow => !!t)

    const candidates: ReconcileCandidate[] = []
    for (const p of fileAdds) {
      try {
        const { size } = await stat(p)
        candidates.push({ filepath: p, size, duration: null })
      } catch {
        // vanished again before we got to it — nothing to reconcile
      }
    }

    const { relinkedIds, stillMissing } = await reconcileCandidates(missing, candidates)

    if (relinkedIds.length) {
      const relinked = relinkedIds
        .map((id) => getTrackById(id))
        .filter((t): t is DbTrackRow => !!t && !!t.filepath)
        .map((t) => ({ id: t.id, filepath: t.filepath as string }))
      if (relinked.length) sendToRenderer('watcher:tracksRelinked', relinked)
    }
    if (stillMissing > 0) {
      const relinkedSet = new Set(relinkedIds)
      const missingIds = missing.filter((t) => !relinkedSet.has(t.id)).map((t) => t.id)
      if (missingIds.length) sendToRenderer('watcher:tracksMissing', missingIds)
    }

    // Whatever reconcileCandidates left in `candidates` is genuinely new —
    // insert as unanalyzed rows (empty bpm/key/energy signal "unanalyzed",
    // same convention as every other import path); analysis stays
    // user-triggered so a big copy-in doesn't stall the watcher.
    if (candidates.length) {
      const folders = getFolders()
      const rootFolder = folders.find((f) => f.root_folder_id === rootId && f.parent_folder_id === null)
      const rows: DbTrackInsert[] = candidates.map(({ filepath, size }) => {
        const dir = dirname(filepath)
        const folderRow = folders.find((f) => f.root_folder_id === rootId && f.path === dir) ?? rootFolder
        const filename = basename(filepath)
        const ext = extname(filepath).toLowerCase()
        return {
          title: (ext ? filename.slice(0, -ext.length) : filename) || filename,
          artist: '',
          bpm: '',
          key_val: '',
          genre: '',
          energy: '',
          column_name: 'Untagged',
          status_is_manual: 0,
          folder: basename(entry.rootPath),
          folder_id: folderRow?.id ?? null,
          filepath,
          camelot: null,
          openkey: null,
          duration_str: null,
          duration_sec: null,
          file_size_mb: Math.round((size / (1024 * 1024)) * 100) / 100,
          format: ext ? ext.slice(1).toUpperCase() : null,
          album: null,
          year: null,
          remixer: '',
          grouping: '',
          composer: '',
          comment: '',
          label: '',
          waveform: null,
          artwork_path: null,
          partial_hash: null,
          last_modified: null,
          filename,
        }
      })
      const results = insertTracks(rows)
      const insertedPaths = rows.filter((_, i) => results[i]?.inserted).map((r) => r.filepath as string)
      if (insertedPaths.length) {
        sendToRenderer('watcher:newFilesDetected', { count: insertedPaths.length, filepaths: insertedPaths })
      }
    }
  } finally {
    entry.reconciling = false
  }
}

export function startWatcher(rootId: number, rootPath: string): void {
  if (watchers.has(rootId)) return // already watching this root

  const watcher = watch(rootPath, {
    ignoreInitial: true, // don't re-announce the whole existing tree as "added" on every start
    ignored: isIgnored,
    persistent: true,
  })

  const entry: WatcherEntry = { watcher, rootPath, reconciling: false, pending: emptyPending() }
  watchers.set(rootId, entry)

  watcher.on('add', (path) => {
    entry.pending.unlinks.delete(path) // same-path recreate cancels out rather than flagging a spurious "missing"
    entry.pending.adds.add(path)
    scheduleFlush(rootId)
  })
  watcher.on('unlink', (path) => {
    entry.pending.adds.delete(path)
    entry.pending.unlinks.add(path)
    scheduleFlush(rootId)
  })
  watcher.on('addDir', (path) => {
    entry.pending.unlinkDirs.delete(path)
    entry.pending.addDirs.add(path)
    scheduleFlush(rootId)
  })
  watcher.on('unlinkDir', (path) => {
    entry.pending.addDirs.delete(path)
    entry.pending.unlinkDirs.add(path)
    scheduleFlush(rootId)
  })
  watcher.on('error', (err) => console.error(`[watcher:${rootId}] error`, err))

  console.log(`[watcher] started for library_root ${rootId} (${rootPath})`)
}

export async function stopWatcher(rootId: number): Promise<void> {
  const entry = watchers.get(rootId)
  if (!entry) return
  if (entry.pending.timer) clearTimeout(entry.pending.timer)
  await entry.watcher.close()
  watchers.delete(rootId)
  console.log(`[watcher] stopped for library_root ${rootId}`)
}

export async function stopAllWatchers(): Promise<void> {
  await Promise.all([...watchers.keys()].map(stopWatcher))
}

export function isWatching(rootId: number): boolean {
  return watchers.has(rootId)
}
