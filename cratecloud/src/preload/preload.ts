import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'

const api = {
  analyzeFile: (filepath: string, writeBack?: boolean): Promise<AnalysisResult> =>
    ipcRenderer.invoke('analyze-file', filepath, writeBack ?? false),

  analyzeFolder: (folderPath: string, writeBack?: boolean): Promise<AnalysisResult[]> =>
    ipcRenderer.invoke('analyze-folder', folderPath, writeBack ?? false),

  onAnalyzeProgress: (callback: (progress: ProgressEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: ProgressEvent) => callback(progress)
    ipcRenderer.on('analyze-progress', handler)
    return () => ipcRenderer.removeListener('analyze-progress', handler)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
