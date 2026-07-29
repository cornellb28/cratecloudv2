import { ElectronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'
import type { BillingState } from '../main/billing'

type FolderRow = {
  id: number
  name: string
  parent_folder_id: number | null
  created_at: number
  updated_at: number | null
  path: string | null
  root_folder_id: number | null
}

type LibraryRootRow = {
  id: number
  name: string
  path: string
  created_at: number
  last_scanned_at: number | null
  status: 'online' | 'offline' | 'missing'
}

type ScanResult = {
  library_root_id: number
  total_folders_found: number
  total_tracks_found: number
  total_files_scanned: number
  total_errors: number
  scan_duration: number
}

type ScanProgress = {
  current: number
  total: number
  file: string
}

// Mirrors src/main/index.ts's FolderMoveResult/UndoMoveEntry — duplicated
// here rather than imported, since main/index.ts pulls in Vite-only asset
// imports (?asset) that tsconfig.web can't resolve.
type FolderMoveResult = {
  trackId: number
  success: boolean
  moved: boolean
  oldFilepath?: string
  newFilepath?: string
  oldFolderId?: number | null
  error?: string
}

type UndoMoveEntry = {
  trackId: number
  oldFilepath?: string
  newFilepath?: string
  oldFolderId: number | null
}

type DbTrackRow = {
  id: number
  title: string
  artist: string
  bpm: string
  key_val: string
  genre: string
  energy: string
  column_name: string
  folder: string | null
  filepath: string | null
  camelot: string | null
  openkey: string | null
  duration_str: string | null
  duration_sec: number | null
  file_size_mb: number | null
  format: string | null
  album: string | null
  year: string | null
  remixer: string | null
  grouping: string | null
  composer: string | null
  comment: string | null
  label: string | null
  waveform: string | null
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: {
        getTracks: () => Promise<DbTrackRow[]>
        insertTracks: (rows: unknown[]) => Promise<{ id: number; inserted: boolean }[]>
        updateTrack: (id: number, fields: Record<string, unknown>) => Promise<void>
        deleteTracks: (ids: number[]) => Promise<void>
        moveTracks: (ids: number[], column: string) => Promise<void>
      }
      editTags: (
        filepath: string,
        meta: Record<string, string | undefined>,
        writeSerato?: boolean
      ) => Promise<{ success: boolean; filepath: string; serato_written?: boolean; error?: string }>
      analyzeFile: (filepath: string, writeBack?: boolean) => Promise<AnalysisResult>
      analyzeFolder: (folderPath: string, writeBack?: boolean) => Promise<AnalysisResult[]>
      onAnalyzeProgress: (callback: (progress: ProgressEvent) => void) => () => void
      dialog: {
        openFolder: () => Promise<string | null>
        openFiles: () => Promise<string[]>
      }
      audio: {
        serverPort: () => Promise<number>
      }
      tags: {
        getAll: () => Promise<{ id: number; field: string; value: string; color: string }[]>
        insert: (field: string, value: string, color: string) => Promise<number>
        delete: (id: number) => Promise<void>
        update: (id: number, value: string, color: string) => Promise<void>
      }
      crate: {
        getAll: () => Promise<{ id: number; name: string; color: string; created_at: number }[]>
        getAllTrackIds: () => Promise<{ crate_id: number; track_id: number }[]>
        insert: (name: string, color: string) => Promise<number>
        update: (id: number, name: string, color: string) => Promise<void>
        delete: (id: number) => Promise<void>
        addTracks: (crateId: number, trackIds: number[]) => Promise<void>
        removeTracks: (crateId: number, trackIds: number[]) => Promise<void>
      }
      fs: {
        moveFile: (fromPath: string, toFolder: string) => Promise<string>
        trashFile: (filepath: string) => Promise<void>
        classifyDropped: (paths: string[]) => Promise<{ files: string[]; folders: string[] }>
        showInFolder: (filepath: string) => Promise<void>
        startDrag: (paths: string[]) => void
      }
      platform: NodeJS.Platform
      dupes: {
        getDismissed: () => Promise<{ track_id_a: number; track_id_b: number; dismissed_at: number }[]>
        dismiss: (idA: number, idB: number) => Promise<void>
      }
      library: {
        rescanFolder: (folderPath: string) => Promise<{ relinked: number; stillMissing: number }>
        importRoot: (rootPath: string) => Promise<ScanResult>
        getRoots: () => Promise<LibraryRootRow[]>
        deleteRoot: (id: number) => Promise<void>
        onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
      }
      folders: {
        getAll: () => Promise<FolderRow[]>
        insert: (name: string, parentId: number | null) => Promise<number>
        rename: (id: number, name: string) => Promise<void>
        move: (id: number, parentId: number | null) => Promise<void>
        delete: (id: number) => Promise<void>
        updateTrackFolders: (entries: { trackId: number; folderId: number | null }[]) => Promise<void>
        ensureTree: (rootAbsolutePath: string, relativeDirs: string[]) => Promise<Record<string, number>>
        moveTracksToFolder: (trackIds: number[], targetFolderId: number) => Promise<FolderMoveResult[]>
        undoMoveBatch: (entries: UndoMoveEntry[]) => Promise<FolderMoveResult[]>
      }
      window: {
        close: () => void
        minimize: () => void
        maximize: () => void
      }
      billing: {
        getState: () => Promise<BillingState>
        startCheckout: (
          plan: 'pro' | 'corporate',
          seats: number
        ) => Promise<{ ok: true } | { ok: false; error: string; reason?: 'already-owned' }>
        cancelPendingCheckout: () => Promise<BillingState>
        pollPending: () => Promise<BillingState & { justUnlocked: boolean }>
        activateLicense: (
          rawKey: string
        ) => Promise<{ ok: true; state: BillingState } | { ok: false; error: string }>
        deactivateLicense: () => Promise<BillingState>
        onUpdated: (callback: (state: BillingState) => void) => () => void
      }
    }
  }
}
