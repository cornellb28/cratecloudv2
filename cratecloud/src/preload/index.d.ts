import { ElectronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'
import type { BillingState } from '../main/billing'

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
        insertTracks: (rows: unknown[]) => Promise<number[]>
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
