import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, extname, basename } from 'path'
import { readdir, rename, copyFile, unlink, stat } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { analyzeFile, type AnalysisResult } from './audioSidecar'
import { getAllTracks, insertTracks, updateTrackFields, deleteTracks, moveTracksToColumn } from './db'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

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
  electronApp.setAppUserModelId('com.cratecloud.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Audio analysis ────────────────────────────────────────────────────────
  ipcMain.handle('analyze-file', async (_event, filepath: string, writeBack = false) => {
    return analyzeFile(filepath, { writeBack })
  })

  ipcMain.handle('analyze-folder', async (event, folderPath: string, writeBack = false) => {
    const entries = await readdir(folderPath)
    const files = entries
      .filter((f) => AUDIO_EXTENSIONS.has(extname(f).toLowerCase()))
      .map((f) => join(folderPath, f))

    const results: AnalysisResult[] = []
    for (let i = 0; i < files.length; i++) {
      event.sender.send('analyze-progress', {
        current: i + 1,
        total: files.length,
        file: basename(files[i]),
      })
      try {
        results.push(await analyzeFile(files[i], { writeBack }))
      } catch (err) {
        results.push({ success: false, filepath: files[i], error: String(err) })
      }
    }
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
    const filename = basename(fromPath)
    const toPath = join(toFolder, filename)
    try {
      await rename(fromPath, toPath)
    } catch (err) {
      // Cross-device move: copy then delete
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

  // ── Window controls ───────────────────────────────────────────────────────
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
