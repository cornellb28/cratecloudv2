import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join, extname, basename, relative, dirname, normalize } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import { readdir, rename, copyFile, unlink, stat, mkdir, writeFile, readFile, open } from 'fs/promises'
import { createReadStream } from 'fs'
import * as http from 'http'
import type { AddressInfo } from 'net'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { startWatcher, stopWatcher, stopAllWatchers } from './libraryWatcher'
import icon from '../../resources/icon.png?asset'
import { analyzeFile, editTags, probeFile, type AnalysisResult, type EditTagsMeta } from './audioSidecar'
import {
  getBillingState,
  startCheckout,
  cancelPendingCheckout,
  verifyPendingCheckout,
  activateLicenseKey,
  deactivateLicense,
  parseCheckoutReturnUrl,
  registerBillingProtocol,
  type PlanId,
} from './billing'
import {
  getAllTracks, getTrackById, insertTracks, updateTrackFields, deleteTracks, moveTracksToColumn,
  autoMoveTracksToColumn, resetTrackStatusManual, updateBoardCriteria,
  getCrates, insertCrate, updateCrateRow, deleteCrateRow,
  getAllCrateTrackIds, addTracksToCrate, removeTracksFromCrate,
  getTags, insertTag, deleteTag, updateTag,
  getSetlists, createSetlist, renameSetlist, deleteSetlist,
  getSetlistTrackIds, addSetlistTrack, removeSetlistTrack,
  reorderSetlistTracks, getSetlistFilepaths,
  getBookmarks, insertBookmark, deleteBookmark, updateBookmark,
  getFolders, insertFolder, renameFolder, updateFolderParent, deleteFolder,
  updateTrackFolderIds, ensureFolderTree,
  getBoards, insertBoard, renameBoardAndCascade, updateBoardColor, updateBoardPositions, deleteBoardAndCascade,
  getDismissedDuplicatePairs, addDismissedDuplicatePair,
  relinkTrackFilepath, markTracksMissing,
  getLibraryRoots, deleteLibraryRoot, ensureLibraryRootTree, markLibraryRootScanned,
  isKnownTrackFilepath,
  type DbTrackInsert, type DbTrackRow,
} from './db'

// ── Billing: cratecloud:// deep link (Stripe Checkout return) ────────────────
// A second app launch via `cratecloud://checkout-return?...` forwards its argv
// to the primary instance through 'second-instance' — single-instance lock is
// required for that to work on Windows/Linux. macOS uses 'open-url' instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

async function handleCheckoutReturn(rawUrl: string): Promise<void> {
  const parsed = parseCheckoutReturnUrl(rawUrl)
  if (!parsed) return
  if (parsed.result === 'cancel') {
    cancelPendingCheckout()
  } else if (parsed.sessionId) {
    await verifyPendingCheckout(parsed.sessionId)
  }
  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send('billing:updated', getBillingState())
}

app.on('second-instance', (_event, argv) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
  const deepLink = argv.find((a) => a.startsWith('cratecloud://'))
  if (deepLink) void handleCheckoutReturn(deepLink)
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  void handleCheckoutReturn(url)
})

// ── Serato crate helpers ──────────────────────────────────────────────────────

async function findSeratoCratesDir(): Promise<string | null> {
  // Search roots: known volume paths + standard home Music
  const searchRoots = [
    '/Volumes/SAASAPPS',
    '/nellz/music',
    join(homedir(), 'Music'),
    join(homedir(), 'music'),
    homedir(),
  ]
  const seratoFolders = ['_Serato_', 'Serato DJ Pro', 'Serato DJ', 'Serato DJ Lite']

  for (const root of searchRoots) {
    for (const folder of seratoFolders) {
      const seratoDir = join(root, folder)
      const cratesDir = join(seratoDir, 'Crates')
      try {
        await stat(seratoDir) // confirm Serato root exists
        await mkdir(cratesDir, { recursive: true }) // create Crates if missing
        return cratesDir
      } catch { /* not found, try next */ }
    }
  }
  return null
}

function buildSeratoCrate(filepaths: string[]): Buffer {
  const toUtf16BE = (s: string): Buffer => {
    const le = Buffer.from(s, 'utf16le')
    const be = Buffer.allocUnsafe(le.length)
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1]
      be[i + 1] = le[i]
    }
    return be
  }
  const field = (tag: string, data: Buffer): Buffer => {
    const len = Buffer.allocUnsafe(4)
    len.writeUInt32BE(data.length, 0)
    return Buffer.concat([Buffer.from(tag, 'ascii'), len, data])
  }
  const chunks: Buffer[] = [field('vrsn', toUtf16BE('1.0/Serato ScratchLive Crate'))]
  for (const p of filepaths) {
    chunks.push(field('otrk', field('ptrk', toUtf16BE(p))))
  }
  return Buffer.concat(chunks)
}

function sanitizeCrateName(name: string): string {
  return name.replace(/[/\\:*?"<>|%%]/g, '_')
}

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const PARTIAL_HASH_PROBE_BYTES = 65536

// Cheap fingerprint: sha256 of a 64KB slice ~40% into the file. Deliberately
// avoids full-file hashing (would freeze on large libraries) and avoids
// parsing ID3v2/APEv2/MP4 metadata containers (exactly what CrateCloud's own
// tag writeback mutates) by staying away from the head/tail of the file.
// Captured once at import time so it's still available for comparison after
// the file itself has gone missing — recomputing it later isn't possible.
async function computePartialHash(filepath: string): Promise<string | null> {
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

async function getLastModified(filepath: string): Promise<number | null> {
  try {
    return Math.floor((await stat(filepath)).mtimeMs / 1000)
  } catch {
    return null
  }
}

// Moves a file into toFolder, auto-suffixing on name collision rather than
// overwriting. Tries rename first (fast path, same volume); falls back to
// copy-verify-delete on EXDEV (cross-device). The source is never deleted
// until the copy's byte size is confirmed to match — a failed/partial copy
// leaves the original untouched.
async function moveFileToFolder(fromPath: string, toFolder: string): Promise<string> {
  const ext = extname(fromPath)
  const base = basename(fromPath, ext)
  let toPath = join(toFolder, basename(fromPath))
  let counter = 1
  while (true) {
    try { await stat(toPath); toPath = join(toFolder, `${base} (${counter++})${ext}`) }
    catch { break } // stat threw → path doesn't exist → safe to use
    if (counter > 99) throw new Error('Too many filename collisions at destination')
  }
  try {
    await rename(fromPath, toPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      const sourceSize = (await stat(fromPath)).size
      await copyFile(fromPath, toPath)
      const copiedSize = (await stat(toPath)).size
      if (copiedSize !== sourceSize) {
        await unlink(toPath).catch(() => {})
        throw new Error(`Copy verification failed (${copiedSize} bytes copied, expected ${sourceSize}) — source left untouched`)
      }
      await unlink(fromPath)
    } else {
      throw err
    }
  }
  return toPath
}

export type FolderMoveResult = {
  trackId: number
  success: boolean
  moved: boolean // true = a real file move happened; false = logical-only reassignment or a no-op
  oldFilepath?: string
  newFilepath?: string
  oldFolderId?: number | null
  error?: string
}

export type UndoMoveEntry = {
  trackId: number
  oldFilepath?: string
  newFilepath?: string
  oldFolderId: number | null
}

export type ScanResult = {
  library_root_id: number
  total_folders_found: number
  total_tracks_found: number
  total_files_scanned: number
  total_errors: number
  scan_duration: number // milliseconds
}

export type ScanProgress = {
  current: number
  total: number
  file: string
}

function describeFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  switch (code) {
    case 'ENOENT': return 'File or destination folder not found — check the drive is connected'
    case 'EACCES': case 'EPERM': return 'Permission denied'
    case 'EROFS': return 'Destination is read-only'
    case 'ENOSPC': return 'Not enough disk space at destination'
    case 'ENOTDIR': return 'Destination is not a folder'
    default: return err instanceof Error ? err.message : String(err)
  }
}

export type ReconcileCandidate = { filepath: string; size: number; duration: number | null }

// Matches "missing" tracks (known to the DB, no longer found at their stored
// path) against newly-discovered candidate files by size -> duration probe
// -> partial_hash, applying relinks/missing-flags directly. Extracted out of
// library:rescanFolder so the manual rescan handler and (a later pass) the
// live filesystem watcher's batched events share one matching
// implementation instead of two that could quietly disagree. Callers own
// producing the missing-set and candidate-set — this function only decides
// and applies the matches.
async function reconcileCandidates(
  missing: DbTrackRow[],
  candidates: ReconcileCandidate[]
): Promise<{ relinked: number; stillMissing: number }> {
  if (!candidates.length) {
    markTracksMissing(missing.map((t) => t.id))
    return { relinked: 0, stillMissing: missing.length }
  }

  let relinkedCount = 0
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
    } else {
      stillMissingIds.push(track.id)
    }
  }

  if (stillMissingIds.length) markTracksMissing(stillMissingIds)
  return { relinked: relinkedCount, stillMissing: stillMissingIds.length }
}

async function saveArtwork(filepath: string, b64: string): Promise<string> {
  const artDir = join(app.getPath('userData'), 'artwork')
  await mkdir(artDir, { recursive: true })
  const hash = createHash('md5').update(filepath).digest('hex')
  const artPath = join(artDir, `${hash}.jpg`)
  await writeFile(artPath, Buffer.from(b64, 'base64'))
  return artPath
}

// Local HTTP server that serves audio files with range-request support.
// Chromium requires range requests (HTTP 206) to seek in audio/video elements.
//
// Loopback-only, but still unauthenticated — anything on the machine that can
// reach 127.0.0.1:<port> can issue a request, so the path is never trusted as
// given. Two kinds of paths are legitimate: (1) artwork thumbnails, always a
// flat file directly inside our own userData/artwork directory, and (2) audio
// files, which must be the exact, on-record filepath of some track (covers
// both registered "Import Library" roots and one-off "Add Files" imports).
// Anything else is refused with 403 before the filesystem is ever touched.
const ARTWORK_DIR = join(app.getPath('userData'), 'artwork')

function isAllowedServePath(resolvedPath: string): boolean {
  if (dirname(resolvedPath) === ARTWORK_DIR) return true
  // Exact match only, never a prefix/containment check — immune to "../"
  // traversal tricks by construction, unlike a startsWith() root check.
  return isKnownTrackFilepath(resolvedPath)
}

// A read stream's 'error' event has no default handler — if a file vanishes
// mid-stream (drive unplugged, file deleted while playing) an unhandled
// 'error' event throws and takes down the whole main process. Routing every
// createReadStream().pipe(res) through here instead keeps that failure
// scoped to the one request.
function pipeFileResponse(stream: ReturnType<typeof createReadStream>, res: http.ServerResponse): void {
  stream.on('error', (err) => {
    console.error('[audio-server] stream error:', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
    stream.destroy()
  })
  stream.pipe(res)
}

let _audioPort = 0
const _audioServer = http.createServer(async (req, res) => {
  const filePath = normalize(decodeURIComponent(req.url!))

  if (!isAllowedServePath(filePath)) {
    res.writeHead(403); res.end(); return
  }

  const mime = AUDIO_MIME[extname(filePath).toLowerCase()] ?? 'audio/mpeg'

  let fileSize: number
  try {
    fileSize = (await stat(filePath)).size
  } catch {
    res.writeHead(404); res.end(); return
  }

  const range = req.headers['range']
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-')
    const start = parseInt(s, 10)
    const end = e ? parseInt(e, 10) : fileSize - 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    })
    pipeFileResponse(createReadStream(filePath, { start, end }), res)
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    })
    pipeFileResponse(createReadStream(filePath), res)
  }
})
_audioServer.on('error', (err) => console.error('[audio-server] error:', err))
_audioServer.listen(0, '127.0.0.1', () => {
  _audioPort = (_audioServer.address() as AddressInfo).port
  console.log('[audio-server] listening on port', _audioPort)
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return

  electronApp.setAppUserModelId('com.cratecloud.app')
  registerBillingProtocol()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Billing ────────────────────────────────────────────────────────────────
  ipcMain.handle('billing:getState', async () => {
    const state = getBillingState()
    // Re-verify against Stripe on startup rather than trusting whatever was
    // last written locally, in case the app closed before a webhook/deep-link
    // resolved a purchase.
    return state.pendingCheckout ? verifyPendingCheckout() : state
  })
  ipcMain.handle('billing:startCheckout', (_e, plan: PlanId, seats: number) =>
    startCheckout(plan, seats)
  )
  ipcMain.handle('billing:cancelPendingCheckout', () => {
    cancelPendingCheckout()
    return getBillingState()
  })
  ipcMain.handle('billing:activateLicense', (_e, rawKey: string) => activateLicenseKey(rawKey))
  ipcMain.handle('billing:deactivateLicense', () => deactivateLicense())
  ipcMain.handle('billing:pollPending', () => verifyPendingCheckout())

  // ── Audio file server ─────────────────────────────────────────────────────
  ipcMain.handle('audio:serverPort', () => {
    console.log('[audio-server] port requested, returning', _audioPort)
    return _audioPort
  })

  // ── Audio analysis ────────────────────────────────────────────────────────
  ipcMain.handle('edit-tags', async (_event, filepath: string, meta: EditTagsMeta, writeSerato = true) => {
    return editTags(filepath, meta, writeSerato)
  })

  ipcMain.handle('analyze-file', async (_event, filepath: string, writeBack = false) => {
    const result = await analyzeFile(filepath, { writeBack })
    if (result.success && result.artwork_b64) {
      try { result.artwork_path = await saveArtwork(filepath, result.artwork_b64) } catch { /* non-fatal */ }
      delete result.artwork_b64
    }
    if (result.success) {
      result.partial_hash = await computePartialHash(filepath)
      result.last_modified = await getLastModified(filepath)
    }
    return result
  })

  ipcMain.handle('analyze-folder', async (event, folderPath: string, writeBack = false) => {
    // Recursively collect all audio files with their path relative to the import root
    type FileEntry = { filepath: string; relative_dir: string }
    async function walkAudioFiles(dir: string, acc: FileEntry[]): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walkAudioFiles(full, acc)
        } else if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          const rel = relative(folderPath, dir)
          acc.push({ filepath: full, relative_dir: rel === '.' || rel === '' ? '' : rel })
        }
      }
    }

    const fileEntries: FileEntry[] = []
    await walkAudioFiles(folderPath, fileEntries)

    const total = fileEntries.length
    const results: AnalysisResult[] = new Array(total)
    let nextIdx = 0
    let completed = 0
    const CONCURRENCY = 4

    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
      while (true) {
        const i = nextIdx++
        if (i >= total) break
        const { filepath, relative_dir } = fileEntries[i]
        try {
          const r = await analyzeFile(filepath, { writeBack })
          if (r.success && r.artwork_b64) {
            try { r.artwork_path = await saveArtwork(filepath, r.artwork_b64) } catch { /* non-fatal */ }
            delete r.artwork_b64
          }
          if (r.success) {
            r.partial_hash = await computePartialHash(filepath)
            r.last_modified = await getLastModified(filepath)
          }
          r.relative_dir = relative_dir
          results[i] = r
        } catch (err) {
          results[i] = { success: false, filepath, relative_dir, error: String(err) }
        }
        completed++
        event.sender.send('analyze-progress', {
          current: completed,
          total,
          file: basename(filepath),
        })
      }
    })

    await Promise.all(workers)
    return results
  })

  // ── Import Library: register a root + recursive scan ──────────────────────
  // Distinct from Add Files (analyze-file/analyze-folder, untouched above):
  // this registers a durable library_roots row and merges into its existing
  // folder tree on repeat scans instead of creating a parallel one. Unlike
  // analyze-folder, results are inserted in batches as the walk proceeds —
  // never accumulated into one giant array — so memory stays bounded and an
  // IPC payload never has to carry 100,000 analysis objects at once.
  ipcMain.handle('library:importRoot', async (event, rootPath: string): Promise<ScanResult> => {
    const startedAt = Date.now()

    type FileEntry = { filepath: string; relative_dir: string }
    const allDirs = new Set<string>(['']) // '' = the root itself
    const fileEntries: FileEntry[] = []
    let walkErrors = 0

    async function walk(dir: string, relDir: string): Promise<void> {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        walkErrors++
        return
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          const childRel = relDir ? `${relDir}/${entry.name}` : entry.name
          allDirs.add(childRel)
          await walk(full, childRel)
        } else if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          fileEntries.push({ filepath: full, relative_dir: relDir })
        }
      }
    }
    await walk(rootPath, '')

    const { libraryRootId, folderIdByRelPath } = ensureLibraryRootTree(
      rootPath,
      [...allDirs].filter((d) => d !== '')
    )

    const total = fileEntries.length
    let completed = 0
    let tracksInserted = 0
    let analysisErrors = 0
    const CONCURRENCY = 4
    const BATCH_SIZE = 200
    let pendingBatch: DbTrackInsert[] = []

    const flushBatch = (): void => {
      if (!pendingBatch.length) return
      const results = insertTracks(pendingBatch)
      tracksInserted += results.filter((r) => r.inserted).length
      pendingBatch = []
    }

    let nextIdx = 0
    const rootBasename = basename(rootPath)
    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
      while (true) {
        const i = nextIdx++
        if (i >= total) break
        const { filepath, relative_dir } = fileEntries[i]
        try {
          const r = await analyzeFile(filepath, { writeBack: false })
          if (r.success) {
            let artworkPath: string | null = null
            if (r.artwork_b64) {
              try { artworkPath = await saveArtwork(filepath, r.artwork_b64) } catch { /* non-fatal */ }
            }
            // bpm/key_val/energy string conversions must stay in sync with
            // useLibraryStore.ts's addTracks — same DB convention (TEXT columns).
            const bpm = r.bpm != null ? String(Math.round(r.bpm)) : ''
            const key_val = r.camelot ?? ''
            const energy = r.energy != null ? String(Math.min(10, Math.round(r.energy * 10))) : ''
            pendingBatch.push({
              title: r.title ?? r.filename ?? 'Unknown',
              artist: r.artist ?? '',
              bpm,
              key_val,
              genre: r.genre ?? '',
              energy,
              column_name: 'Untagged', // real board placement runs once, in bulk, after the scan (recomputeAllAutoStatuses)
              status_is_manual: 0,
              folder: rootBasename,
              folder_id: folderIdByRelPath[relative_dir] ?? folderIdByRelPath[''],
              filepath: r.filepath,
              camelot: r.camelot ?? null,
              openkey: r.openkey ?? null,
              duration_str: r.duration_str ?? null,
              duration_sec: r.duration_sec ?? null,
              file_size_mb: r.file_size_mb ?? null,
              format: r.format ?? null,
              album: r.album ?? null,
              year: r.year ?? null,
              remixer: r.remixer ?? '',
              grouping: r.grouping ?? '',
              composer: r.composer ?? '',
              comment: r.comment ?? '',
              label: r.label ?? '',
              waveform: r.waveform ? JSON.stringify(r.waveform) : null,
              artwork_path: artworkPath,
              partial_hash: await computePartialHash(filepath),
              last_modified: await getLastModified(filepath),
              filename: r.filename ?? basename(filepath),
            })
            if (pendingBatch.length >= BATCH_SIZE) flushBatch()
          } else {
            analysisErrors++
          }
        } catch {
          analysisErrors++
        }
        completed++
        event.sender.send('library-scan-progress', { current: completed, total, file: basename(filepath) })
      }
    })
    await Promise.all(workers)
    flushBatch() // tail end shorter than BATCH_SIZE

    markLibraryRootScanned(libraryRootId)
    startWatcher(libraryRootId, rootPath)

    return {
      library_root_id: libraryRootId,
      total_folders_found: allDirs.size,
      total_tracks_found: tracksInserted,
      total_files_scanned: total,
      total_errors: walkErrors + analysisErrors,
      scan_duration: Date.now() - startedAt,
    }
  })

  ipcMain.handle('library:getRoots', () => getLibraryRoots())
  ipcMain.handle('library:deleteRoot', async (_e, id: number) => {
    await stopWatcher(id)
    deleteLibraryRoot(id)
  })

  // ── Library rescan / orphan reconciliation ────────────────────────────────
  // Narrow trigger only: a previously-known track's file no longer resolves
  // on disk (moved/renamed outside the app). Internal edits never need this —
  // they already know which row they're touching (see updateTrackFields).
  // Not automatic; the user fires this explicitly (Settings → Rescan Library).
  ipcMain.handle('library:rescanFolder', async (_event, folderPath: string) => {
    const tracksWithPath = getAllTracks().filter((t) => t.filepath)

    // 1. Which known tracks no longer resolve on disk? Cheap — stat only, no decode.
    const missing: typeof tracksWithPath = []
    {
      let idx = 0
      const CONCURRENCY = 8
      const workers = Array.from({ length: Math.min(CONCURRENCY, tracksWithPath.length) }, async () => {
        while (idx < tracksWithPath.length) {
          const track = tracksWithPath[idx++]
          try {
            await stat(track.filepath!)
          } catch {
            missing.push(track)
          }
        }
      })
      await Promise.all(workers)
    }

    if (!missing.length) {
      // Nothing to reconcile. Any genuinely new files in this folder are
      // picked up by the normal import flow the caller runs afterward.
      return { relinked: 0, stillMissing: 0 }
    }

    // 2. Walk the target folder for audio files not already a known filepath.
    const knownPaths = new Set(tracksWithPath.map((t) => t.filepath as string))
    const candidates: ReconcileCandidate[] = []
    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()) && !knownPaths.has(full)) {
          try {
            const { size } = await stat(full)
            candidates.push({ filepath: full, size, duration: null })
          } catch { /* vanished mid-walk, skip */ }
        }
      }
    }
    await walk(folderPath)

    // 3. Match each missing track against THIS SCAN's candidates only — never
    // against the whole disk or whole library, to keep this cheap. Shared
    // with the (future) live watcher — see reconcileCandidates above.
    return reconcileCandidates(missing, candidates)
  })

  // ── File dialogs ──────────────────────────────────────────────────────────
  ipcMain.handle('dialog:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select music folder',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('artwork:pick', async (event, audioFilepath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Choose album artwork',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const imgBuffer = await readFile(result.filePaths[0])
    return saveArtwork(audioFilepath, imgBuffer.toString('base64'))
  })

  ipcMain.handle('dialog:openFiles', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select audio files',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'aiff', 'aif', 'm4a', 'ogg'] },
      ],
    })
    return result.canceled ? [] : result.filePaths
  })

  // ── File system operations ────────────────────────────────────────────────
  ipcMain.handle('fs:moveFile', async (_event, fromPath: string, toFolder: string) =>
    moveFileToFolder(fromPath, toFolder)
  )

  ipcMain.handle('fs:trashFile', async (_event, filepath: string) => {
    await shell.trashItem(filepath)
  })

  // ── Finder/Explorer integration ─────────────────────────────────────────────
  ipcMain.handle('fs:showInFolder', (_event, filepath: string) => {
    shell.showItemInFolder(filepath)
  })

  // icon is required (non-empty) by startDrag on macOS; the app icon doubles
  // as a generic drag cursor rather than a per-file thumbnail.
  const dragIcon = nativeImage.createFromPath(icon)

  ipcMain.on('fs:startDrag', (event, paths: string[]) => {
    if (!paths.length) return
    event.sender.startDrag({
      file: paths[0],
      files: paths,
      icon: dragIcon,
    })
  })

  ipcMain.handle('fs:classifyDropped', async (_event, paths: string[]) => {
    const files: string[] = []
    const folders: string[] = []
    for (const p of paths) {
      try {
        const s = await stat(p)
        if (s.isDirectory()) folders.push(p)
        else files.push(p)
      } catch { /* skip inaccessible paths */ }
    }
    return { files, folders }
  })

  // ── Database ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:getTracks', () => getAllTracks())

  ipcMain.handle('db:insertTracks', (_event, rows) => insertTracks(rows))

  ipcMain.handle('db:updateTrack', (_event, id: number, fields: Record<string, unknown>) =>
    updateTrackFields(id, fields)
  )

  ipcMain.handle('db:deleteTracks', (_event, ids: number[]) => deleteTracks(ids))

  ipcMain.handle('db:moveTracks', (_event, ids: number[], column: string) =>
    moveTracksToColumn(ids, column)
  )

  // ── Crates ────────────────────────────────────────────────────────────────
  ipcMain.handle('crate:getAll', () => getCrates())
  ipcMain.handle('crate:getAllTrackIds', () => getAllCrateTrackIds())
  ipcMain.handle('crate:insert', (_event, name: string, color: string) => insertCrate(name, color))
  ipcMain.handle('crate:update', (_event, id: number, name: string, color: string) => updateCrateRow(id, name, color))
  ipcMain.handle('crate:delete', (_event, id: number) => deleteCrateRow(id))
  ipcMain.handle('crate:addTracks', (_event, crateId: number, trackIds: number[]) => addTracksToCrate(crateId, trackIds))
  ipcMain.handle('crate:removeTracks', (_event, crateId: number, trackIds: number[]) => removeTracksFromCrate(crateId, trackIds))

  // ── Tags ─────────────────────────────────────────────────────────────────
  ipcMain.handle('tag:getAll', () => getTags())
  ipcMain.handle('tag:insert', (_event, field: string, value: string, color: string) =>
    insertTag(field, value, color)
  )
  ipcMain.handle('tag:delete', (_event, id: number) => deleteTag(id))
  ipcMain.handle('tag:update', (_event, id: number, value: string, color: string) =>
    updateTag(id, value, color)
  )

  // ── Setlists ──────────────────────────────────────────────────────────────
  ipcMain.handle('setlist:getAll', () => getSetlists())
  ipcMain.handle('setlist:getTrackIds', (_e, id: number) => getSetlistTrackIds(id))
  ipcMain.handle('setlist:create', (_e, name: string) => createSetlist(name))
  ipcMain.handle('setlist:rename', (_e, id: number, name: string) => renameSetlist(id, name))
  ipcMain.handle('setlist:delete', (_e, id: number) => deleteSetlist(id))
  ipcMain.handle('setlist:addTrack', (_e, setlistId: number, trackId: number) =>
    addSetlistTrack(setlistId, trackId)
  )
  ipcMain.handle('setlist:removeTrack', (_e, setlistId: number, trackId: number) =>
    removeSetlistTrack(setlistId, trackId)
  )
  ipcMain.handle('setlist:reorder', (_e, setlistId: number, trackIds: number[]) =>
    reorderSetlistTracks(setlistId, trackIds)
  )
  ipcMain.handle('setlist:exportSerato', async (_e, setlistId: number, setlistName: string) => {
    try {
      const cratesDir = await findSeratoCratesDir()
      if (!cratesDir) {
        return { success: false, seratoDetected: false, error: 'Serato not found on this machine.' }
      }
      const filepaths = getSetlistFilepaths(setlistId)
      if (!filepaths.length) {
        return { success: false, seratoDetected: true, error: 'No tracks with file paths to export.' }
      }
      const crate = buildSeratoCrate(filepaths)
      const safe = sanitizeCrateName(setlistName)
      const filename = `CrateCloud%%${safe}.crate`
      const outPath = join(cratesDir, filename)
      await writeFile(outPath, crate)
      return { success: true, seratoDetected: true, path: outPath }
    } catch (err) {
      return { success: false, seratoDetected: true, error: String(err) }
    }
  })

  // ── Window controls ───────────────────────────────────────────────────────
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('bookmark:getAll', () => getBookmarks())
  ipcMain.handle('bookmark:insert', (_e, url: string, label: string) => insertBookmark(url, label))
  ipcMain.handle('bookmark:delete', (_e, id: number) => deleteBookmark(id))
  ipcMain.handle('bookmark:update', (_e, id: number, url: string, label: string) => updateBookmark(id, url, label))
  ipcMain.handle('bookmark:open', (_e, url: string) => shell.openExternal(url))

  // ── Boards ─────────────────────────────────────────────────────────────────
  ipcMain.handle('board:getAll', () => getBoards())
  ipcMain.handle('board:insert', (_e, name: string, color: string, position: number) =>
    insertBoard(name, color, position)
  )
  ipcMain.handle('board:rename', (_e, id: number, oldName: string, newName: string) =>
    renameBoardAndCascade(id, oldName, newName)
  )
  ipcMain.handle('board:updateColor', (_e, id: number, color: string) => updateBoardColor(id, color))
  ipcMain.handle('board:reorder', (_e, entries: { id: number; position: number }[]) =>
    updateBoardPositions(entries)
  )
  ipcMain.handle('board:delete', (_e, id: number, fallbackName: string) =>
    deleteBoardAndCascade(id, fallbackName)
  )
  ipcMain.handle('board:updateCriteria', (_e, id: number, criteria: string[] | null) =>
    updateBoardCriteria(id, criteria)
  )
  ipcMain.handle('db:autoMoveTracks', (_e, ids: number[], column: string) =>
    autoMoveTracksToColumn(ids, column)
  )
  ipcMain.handle('db:resetTrackStatus', (_e, id: number) =>
    resetTrackStatusManual(id)
  )

  // ── Duplicate detection ──────────────────────────────────────────────────────
  ipcMain.handle('dupes:getDismissed', () => getDismissedDuplicatePairs())
  ipcMain.handle('dupes:dismiss', (_e, idA: number, idB: number) =>
    addDismissedDuplicatePair(idA, idB)
  )

  // ── Folders ────────────────────────────────────────────────────────────────
  ipcMain.handle('folder:getAll', () => getFolders())
  ipcMain.handle('folder:insert', (_e, name: string, parentId: number | null) =>
    insertFolder(name, parentId)
  )
  ipcMain.handle('folder:rename', (_e, id: number, name: string) => renameFolder(id, name))
  ipcMain.handle('folder:move', (_e, id: number, parentId: number | null) =>
    updateFolderParent(id, parentId)
  )
  ipcMain.handle('folder:delete', (_e, id: number) => deleteFolder(id))
  ipcMain.handle(
    'folder:updateTrackFolders',
    (_e, entries: { trackId: number; folderId: number | null }[]) => updateTrackFolderIds(entries)
  )
  ipcMain.handle('folder:ensureTree', (_e, rootAbsolutePath: string, relativeDirs: string[]) =>
    ensureFolderTree(rootAbsolutePath, relativeDirs)
  )

  // Drag-to-move within the Folders tree: identity is already known (the
  // dragged row's id/client_uuid), so this is a direct move, never the
  // size/duration/partial_hash reconciliation used for externally-moved
  // files — see library:rescanFolder. Each track succeeds or fails on its own.
  ipcMain.handle('folder:moveTracksToFolder', async (_e, trackIds: number[], targetFolderId: number) => {
    const folder = getFolders().find((f) => f.id === targetFolderId)
    const results: FolderMoveResult[] = []

    for (const trackId of trackIds) {
      const track = getTrackById(trackId)
      if (!track) {
        results.push({ trackId, success: false, moved: false, error: 'Track no longer exists' })
        continue
      }
      const oldFolderId = track.folder_id

      if (!track.filepath || !folder?.path) {
        // No file to move, or destination has no known disk location —
        // fall back to the pre-existing logical-only reassignment.
        updateTrackFolderIds([{ trackId, folderId: targetFolderId }])
        results.push({
          trackId, success: true, moved: false,
          oldFilepath: track.filepath ?? undefined, newFilepath: track.filepath ?? undefined, oldFolderId,
        })
        continue
      }

      try {
        const newPath = await moveFileToFolder(track.filepath, folder.path)
        updateTrackFields(trackId, { filepath: newPath, folder_id: targetFolderId })
        results.push({ trackId, success: true, moved: true, oldFilepath: track.filepath, newFilepath: newPath, oldFolderId })
      } catch (err) {
        results.push({ trackId, success: false, moved: false, oldFilepath: track.filepath, error: describeFsError(err) })
      }
    }
    return results
  })

  // Reverses one moveTracksToFolder batch: moves files back (if they were
  // really moved) and restores folder_id. Best-effort per entry — a failure
  // on one track doesn't block undoing the rest.
  ipcMain.handle('folder:undoMoveBatch', async (_e, entries: UndoMoveEntry[]) => {
    const results: FolderMoveResult[] = []
    for (const entry of entries) {
      try {
        if (entry.oldFilepath === entry.newFilepath) {
          updateTrackFolderIds([{ trackId: entry.trackId, folderId: entry.oldFolderId }])
          results.push({ trackId: entry.trackId, success: true, moved: false, oldFolderId: entry.oldFolderId })
        } else {
          const restoredPath = await moveFileToFolder(entry.newFilepath!, dirname(entry.oldFilepath!))
          updateTrackFields(entry.trackId, { filepath: restoredPath, folder_id: entry.oldFolderId })
          results.push({ trackId: entry.trackId, success: true, moved: true, newFilepath: restoredPath, oldFolderId: entry.oldFolderId })
        }
      } catch (err) {
        results.push({ trackId: entry.trackId, success: false, moved: false, error: describeFsError(err) })
      }
    }
    return results
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Live filesystem watching for every registered root that's currently
  // online — additive to the manual "Rescan Library" flow, not a
  // replacement (see libraryWatcher.ts). Offline roots are skipped; nothing
  // yet flips a root back to 'online'/starts its watcher on reconnect —
  // that's drive-disconnect handling, a later pass.
  for (const root of getLibraryRoots()) {
    if (root.status === 'online') startWatcher(root.id, root.path)
  }

  // Stable-channel-only auto-update via GitHub Releases (see the `publish`
  // block in electron-builder.yml — that's the same config this reads at
  // runtime from the packaged app-update.yml). Dev builds have no
  // app-update.yml and aren't code-signed, so this only runs when packaged.
  //
  // Linux note: this only actually updates the AppImage target — it checks
  // process.env.APPIMAGE to confirm it's running as one, and downloads +
  // swaps the file in place, requiring a relaunch. .deb installs are NOT
  // auto-updatable this way; they're expected to update via apt/the system
  // package manager instead, same as any other .deb-installed app.
  if (!is.dev) {
    autoUpdater.on('error', (err) => console.error('[auto-update] error:', err))
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[auto-update] check failed:', err)
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllWatchers().catch((err) => console.error('[watcher] cleanup on quit failed:', err))
})
