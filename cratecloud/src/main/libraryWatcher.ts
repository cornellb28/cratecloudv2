import { watch, type FSWatcher } from 'chokidar'
import { extname } from 'path'

// Live filesystem watching for registered library_roots — additive to, not
// a replacement for, the manual "Rescan Library" flow (library:rescanFolder
// / reconcileCandidates in index.ts). This pass only proves the watcher
// lifecycle and that events fire correctly per root; it does NOT yet feed
// events into reconcileCandidates, debounce/batch them, or touch the UI —
// that's the next pass.

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

type WatcherEntry = {
  watcher: FSWatcher
  // Scaffolding for the next pass: guards a root's reconciliation so a
  // manual rescan and watcher-triggered reconciliation never process the
  // same root concurrently. Unused this pass — just the shape to attach to.
  reconciling: boolean
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

export function startWatcher(rootId: number, rootPath: string): void {
  if (watchers.has(rootId)) return // already watching this root

  const watcher = watch(rootPath, {
    ignoreInitial: true, // don't re-announce the whole existing tree as "added" on every start
    ignored: isIgnored,
    persistent: true,
  })

  watcher.on('add', (path) => console.log(`[watcher:${rootId}] add`, path))
  watcher.on('unlink', (path) => console.log(`[watcher:${rootId}] unlink`, path))
  watcher.on('addDir', (path) => console.log(`[watcher:${rootId}] addDir`, path))
  watcher.on('unlinkDir', (path) => console.log(`[watcher:${rootId}] unlinkDir`, path))
  watcher.on('error', (err) => console.error(`[watcher:${rootId}] error`, err))

  watchers.set(rootId, { watcher, reconciling: false })
  console.log(`[watcher] started for library_root ${rootId} (${rootPath})`)
}

export async function stopWatcher(rootId: number): Promise<void> {
  const entry = watchers.get(rootId)
  if (!entry) return
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
