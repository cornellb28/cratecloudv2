import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, extname, basename, relative } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import { readdir, rename, copyFile, unlink, stat, mkdir, writeFile, readFile } from 'fs/promises'
import { createReadStream } from 'fs'
import * as http from 'http'
import type { AddressInfo } from 'net'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { analyzeFile, editTags, type AnalysisResult, type EditTagsMeta } from './audioSidecar'
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
  getAllTracks, insertTracks, updateTrackFields, deleteTracks, moveTracksToColumn,
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
let _audioPort = 0
const _audioServer = http.createServer(async (req, res) => {
  const filePath = decodeURIComponent(req.url!)
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
    createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    })
    createReadStream(filePath).pipe(res)
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
  ipcMain.handle('fs:moveFile', async (_event, fromPath: string, toFolder: string) => {
    const ext = extname(fromPath)
    const base = basename(fromPath, ext)
    // Find a non-colliding destination path
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
        await copyFile(fromPath, toPath)
        await unlink(fromPath)
      } else {
        throw err
      }
    }
    return toPath
  })

  ipcMain.handle('fs:trashFile', async (_event, filepath: string) => {
    await shell.trashItem(filepath)
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
  ipcMain.handle('folder:ensureTree', (_e, rootName: string, relativeDirs: string[]) =>
    ensureFolderTree(rootName, relativeDirs)
  )

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
