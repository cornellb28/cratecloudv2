import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, extname, basename } from 'path'
import { readdir } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { analyzeFile, type AnalysisResult } from './audioSidecar'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
