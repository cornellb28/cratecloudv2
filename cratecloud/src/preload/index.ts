import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'
import type { BillingState } from '../main/billing'
import type { FolderMoveResult, UndoMoveEntry, ScanResult, ScanProgress } from '../main/index'
import type { LibraryRootRow } from '../main/db'

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
    showInFolder: (filepath: string): Promise<void> =>
      ipcRenderer.invoke('fs:showInFolder', filepath),
    startDrag: (paths: string[]): void => ipcRenderer.send('fs:startDrag', paths),
  },

  // ── Platform (for "Finder" vs "Explorer" labeling, etc.) ────────────────
  platform: process.platform,

  // ── Duplicate detection ─────────────────────────────────────────────────
  dupes: {
    getDismissed: (): Promise<{ track_id_a: number; track_id_b: number; dismissed_at: number }[]> =>
      ipcRenderer.invoke('dupes:getDismissed'),
    dismiss: (idA: number, idB: number): Promise<void> =>
      ipcRenderer.invoke('dupes:dismiss', idA, idB),
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
    getAll: (): Promise<{ id: number; name: string; parent_folder_id: number | null; created_at: number; path: string | null }[]> =>
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
    ensureTree: (rootAbsolutePath: string, relativeDirs: string[]): Promise<Record<string, number>> =>
      ipcRenderer.invoke('folder:ensureTree', rootAbsolutePath, relativeDirs),
    moveTracksToFolder: (trackIds: number[], targetFolderId: number): Promise<FolderMoveResult[]> =>
      ipcRenderer.invoke('folder:moveTracksToFolder', trackIds, targetFolderId),
    undoMoveBatch: (entries: UndoMoveEntry[]): Promise<FolderMoveResult[]> =>
      ipcRenderer.invoke('folder:undoMoveBatch', entries),
  },

  // ── Library rescan / orphan reconciliation ──────────────────────────────────
  library: {
    rescanFolder: (folderPath: string): Promise<{ relinked: number; stillMissing: number }> =>
      ipcRenderer.invoke('library:rescanFolder', folderPath),
    importRoot: (rootPath: string): Promise<ScanResult> =>
      ipcRenderer.invoke('library:importRoot', rootPath),
    getRoots: (): Promise<LibraryRootRow[]> => ipcRenderer.invoke('library:getRoots'),
    deleteRoot: (id: number): Promise<void> => ipcRenderer.invoke('library:deleteRoot', id),
    onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: ScanProgress) => callback(progress)
      ipcRenderer.on('library-scan-progress', handler)
      return () => ipcRenderer.removeListener('library-scan-progress', handler)
    },
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

  // ── Billing ──────────────────────────────────────────────────────────────
  billing: {
    getState: (): Promise<BillingState> => ipcRenderer.invoke('billing:getState'),
    startCheckout: (
      plan: 'pro' | 'corporate',
      seats: number
    ): Promise<{ ok: true } | { ok: false; error: string; reason?: 'already-owned' }> =>
      ipcRenderer.invoke('billing:startCheckout', plan, seats),
    cancelPendingCheckout: (): Promise<BillingState> =>
      ipcRenderer.invoke('billing:cancelPendingCheckout'),
    pollPending: (): Promise<BillingState & { justUnlocked: boolean }> =>
      ipcRenderer.invoke('billing:pollPending'),
    activateLicense: (
      rawKey: string
    ): Promise<{ ok: true; state: BillingState } | { ok: false; error: string }> =>
      ipcRenderer.invoke('billing:activateLicense', rawKey),
    deactivateLicense: (): Promise<BillingState> => ipcRenderer.invoke('billing:deactivateLicense'),
    onUpdated: (callback: (state: BillingState) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, state: BillingState) => callback(state)
      ipcRenderer.on('billing:updated', handler)
      return () => ipcRenderer.removeListener('billing:updated', handler)
    },
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
