import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'

const api = {
  // ── Audio analysis ─────────────────────────────────────────────────────
  editTags: (
    filepath: string,
    meta: Record<string, string | undefined>,
    writeSerato?: boolean
  ): Promise<{ success: boolean; filepath: string; serato_written?: boolean; error?: string }> =>
    ipcRenderer.invoke('edit-tags', filepath, meta, writeSerato ?? true),

  analyzeFile: (filepath: string, writeBack?: boolean): Promise<AnalysisResult> =>
    ipcRenderer.invoke('analyze-file', filepath, writeBack ?? false),

  analyzeFolder: (folderPath: string, writeBack?: boolean): Promise<AnalysisResult[]> =>
    ipcRenderer.invoke('analyze-folder', folderPath, writeBack ?? false),

  onAnalyzeProgress: (callback: (progress: ProgressEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: ProgressEvent) => callback(progress)
    ipcRenderer.on('analyze-progress', handler)
    return () => ipcRenderer.removeListener('analyze-progress', handler)
  },

  // ── Database ────────────────────────────────────────────────────────────
  db: {
    getTracks: () => ipcRenderer.invoke('db:getTracks'),
    insertTracks: (rows: unknown[]) => ipcRenderer.invoke('db:insertTracks', rows),
    updateTrack: (id: number, fields: Record<string, unknown>) =>
      ipcRenderer.invoke('db:updateTrack', id, fields),
    deleteTracks: (ids: number[]) => ipcRenderer.invoke('db:deleteTracks', ids),
    moveTracks: (ids: number[], column: string) =>
      ipcRenderer.invoke('db:moveTracks', ids, column),
  },

  // ── File dialogs ────────────────────────────────────────────────────────
  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
    openFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  },

  // ── File system operations ──────────────────────────────────────────────
  fs: {
    moveFile: (fromPath: string, toFolder: string): Promise<string> =>
      ipcRenderer.invoke('fs:moveFile', fromPath, toFolder),
    trashFile: (filepath: string): Promise<void> =>
      ipcRenderer.invoke('fs:trashFile', filepath),
    classifyDropped: (paths: string[]): Promise<{ files: string[]; folders: string[] }> =>
      ipcRenderer.invoke('fs:classifyDropped', paths),
  },

  // ── Crates ──────────────────────────────────────────────────────────────────
  crate: {
    getAll: (): Promise<{ id: number; name: string; color: string; created_at: number }[]> =>
      ipcRenderer.invoke('crate:getAll'),
    getAllTrackIds: (): Promise<{ crate_id: number; track_id: number }[]> =>
      ipcRenderer.invoke('crate:getAllTrackIds'),
    insert: (name: string, color: string): Promise<number> =>
      ipcRenderer.invoke('crate:insert', name, color),
    update: (id: number, name: string, color: string): Promise<void> =>
      ipcRenderer.invoke('crate:update', id, name, color),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('crate:delete', id),
    addTracks: (crateId: number, trackIds: number[]): Promise<void> =>
      ipcRenderer.invoke('crate:addTracks', crateId, trackIds),
    removeTracks: (crateId: number, trackIds: number[]): Promise<void> =>
      ipcRenderer.invoke('crate:removeTracks', crateId, trackIds),
  },

  // ── Window controls ─────────────────────────────────────────────────────
  window: {
    close: () => ipcRenderer.send('window:close'),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
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
  Object.assign(window, { electron: electronAPI, api })
}
