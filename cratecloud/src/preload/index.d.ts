import { ElectronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'

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
      analyzeFile: (filepath: string, writeBack?: boolean) => Promise<AnalysisResult>
      analyzeFolder: (folderPath: string, writeBack?: boolean) => Promise<AnalysisResult[]>
      onAnalyzeProgress: (callback: (progress: ProgressEvent) => void) => () => void
      dialog: {
        openFolder: () => Promise<string | null>
        openFiles: () => Promise<string[]>
      }
      fs: {
        moveFile: (fromPath: string, toFolder: string) => Promise<string>
        trashFile: (filepath: string) => Promise<void>
        classifyDropped: (paths: string[]) => Promise<{ files: string[]; folders: string[] }>
      }
      window: {
        close: () => void
        minimize: () => void
        maximize: () => void
      }
    }
  }
}
