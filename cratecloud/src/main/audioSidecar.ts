import { spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

export type AnalysisResult = {
  success: boolean
  filepath: string
  filename?: string
  file_size_mb?: number
  format?: string
  title?: string | null
  artist?: string | null
  album?: string | null
  genre?: string | null
  track?: string | null
  year?: string | null
  bpm?: number
  key?: string
  camelot?: string
  openkey?: string
  duration_sec?: number
  duration_str?: string
  energy?: number
  waveform?: number[]
  bpm_source?: string
  key_source?: string
  wrote_tags?: boolean
  elapsed_sec?: number
  error?: string
}

export type ProgressEvent = {
  type: 'progress'
  current: number
  total: number
  file: string
}

function getSidecarPaths(): { python: string; script: string | null } {
  if (is.dev) {
    const root = app.getAppPath()
    return {
      python: join(root, 'sidecar/.venv/bin/python3'),
      script: join(root, 'sidecar/analyze.py'),
    }
  }
  // Production: PyInstaller binary bundled into resources/sidecar
  return {
    python: join(process.resourcesPath, 'sidecar'),
    script: null,
  }
}

export function analyzeFile(
  filepath: string,
  options: { writeBack?: boolean; onProgress?: (msg: ProgressEvent) => void } = {}
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const { python, script } = getSidecarPaths()
    const args = script ? [script, filepath] : [filepath]
    if (options.writeBack) args.push('--write-back')

    const child = spawn(python, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().trim().split('\n')) {
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'progress') options.onProgress?.(msg as ProgressEvent)
        } catch { /* partial chunk */ }
      }
    })

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`Python exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as AnalysisResult)
      } catch {
        reject(new Error(`Bad JSON from sidecar: ${stdout.slice(0, 200)}`))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Spawn failed: ${err.message}`))
    })
  })
}
