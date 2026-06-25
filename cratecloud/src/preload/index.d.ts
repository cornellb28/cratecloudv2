import { ElectronAPI } from '@electron-toolkit/preload'
import type { AnalysisResult, ProgressEvent } from '../main/audioSidecar'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      analyzeFile: (filepath: string, writeBack?: boolean) => Promise<AnalysisResult>
      analyzeFolder: (folderPath: string, writeBack?: boolean) => Promise<AnalysisResult[]>
      onAnalyzeProgress: (callback: (progress: ProgressEvent) => void) => () => void
    }
  }
}
