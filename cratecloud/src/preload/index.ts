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
    autoMoveTracks: (ids: number[], column: string) =>
      ipcRenderer.invoke('db:autoMoveTracks', ids, column),
    resetTrackStatus: (id: number): Promise<void> =>
      ipcRenderer.invoke('db:resetTrackStatus', id),
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

  // ── Audio server ────────────────────────────────────────────────────────────
  audio: {
    serverPort: (): Promise<number> => ipcRenderer.invoke('audio:serverPort'),
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

  // ── Tags ────────────────────────────────────────────────────────────────────
  tags: {
    getAll: (): Promise<{ id: number; field: string; value: string; color: string }[]> =>
      ipcRenderer.invoke('tag:getAll'),
    insert: (field: string, value: string, color: string): Promise<number> =>
      ipcRenderer.invoke('tag:insert', field, value, color),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('tag:delete', id),
    update: (id: number, value: string, color: string): Promise<void> =>
      ipcRenderer.invoke('tag:update', id, value, color),
  },

  // ── Setlists ────────────────────────────────────────────────────────────────
  setlist: {
    getAll: (): Promise<{ id: number; name: string; created_at: number }[]> =>
      ipcRenderer.invoke('setlist:getAll'),
    getTrackIds: (id: number): Promise<number[]> =>
      ipcRenderer.invoke('setlist:getTrackIds', id),
    create: (name: string): Promise<number> =>
      ipcRenderer.invoke('setlist:create', name),
    rename: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('setlist:rename', id, name),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('setlist:delete', id),
    addTrack: (setlistId: number, trackId: number): Promise<void> =>
      ipcRenderer.invoke('setlist:addTrack', setlistId, trackId),
    removeTrack: (setlistId: number, trackId: number): Promise<void> =>
      ipcRenderer.invoke('setlist:removeTrack', setlistId, trackId),
    reorder: (setlistId: number, trackIds: number[]): Promise<void> =>
      ipcRenderer.invoke('setlist:reorder', setlistId, trackIds),
    exportSerato: (
      setlistId: number,
      name: string
    ): Promise<{ success: boolean; seratoDetected: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('setlist:exportSerato', setlistId, name),
  },

  // ── Boards ──────────────────────────────────────────────────────────────────
  board: {
    getAll: (): Promise<{ id: number; name: string; color: string; position: number; created_at: number }[]> =>
      ipcRenderer.invoke('board:getAll'),
    insert: (name: string, color: string, position: number): Promise<number> =>
      ipcRenderer.invoke('board:insert', name, color, position),
    rename: (id: number, oldName: string, newName: string): Promise<void> =>
      ipcRenderer.invoke('board:rename', id, oldName, newName),
    updateColor: (id: number, color: string): Promise<void> =>
      ipcRenderer.invoke('board:updateColor', id, color),
    reorder: (entries: { id: number; position: number }[]): Promise<void> =>
      ipcRenderer.invoke('board:reorder', entries),
    delete: (id: number, fallbackName: string): Promise<void> =>
      ipcRenderer.invoke('board:delete', id, fallbackName),
    updateCriteria: (id: number, criteria: string[] | null): Promise<void> =>
      ipcRenderer.invoke('board:updateCriteria', id, criteria),
  },

  // ── Folders ─────────────────────────────────────────────────────────────────
  folders: {
    getAll: (): Promise<{ id: number; name: string; parent_folder_id: number | null; created_at: number }[]> =>
      ipcRenderer.invoke('folder:getAll'),
    insert: (name: string, parentId: number | null): Promise<number> =>
      ipcRenderer.invoke('folder:insert', name, parentId),
    rename: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('folder:rename', id, name),
    move: (id: number, parentId: number | null): Promise<void> =>
      ipcRenderer.invoke('folder:move', id, parentId),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('folder:delete', id),
    updateTrackFolders: (entries: { trackId: number; folderId: number | null }[]): Promise<void> =>
      ipcRenderer.invoke('folder:updateTrackFolders', entries),
    ensureTree: (rootName: string, relativeDirs: string[]): Promise<Record<string, number>> =>
      ipcRenderer.invoke('folder:ensureTree', rootName, relativeDirs),
  },

  // ── Bookmarks ───────────────────────────────────────────────────────────────
  bookmarks: {
    getAll: (): Promise<{ id: number; url: string; label: string; created_at: number }[]> =>
      ipcRenderer.invoke('bookmark:getAll'),
    insert: (url: string, label: string): Promise<number> =>
      ipcRenderer.invoke('bookmark:insert', url, label),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('bookmark:delete', id),
    update: (id: number, url: string, label: string): Promise<void> =>
      ipcRenderer.invoke('bookmark:update', id, url, label),
    open: (url: string): Promise<void> => ipcRenderer.invoke('bookmark:open', url),
  },

  // ── Artwork ─────────────────────────────────────────────────────────────────
  artwork: {
    pick: (audioFilepath: string): Promise<string | null> =>
      ipcRenderer.invoke('artwork:pick', audioFilepath),
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
