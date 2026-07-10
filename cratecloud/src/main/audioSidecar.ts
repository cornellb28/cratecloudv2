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
  remixer?: string | null
  grouping?: string | null
  composer?: string | null
  comment?: string | null
  label?: string | null
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
  artwork_b64?: string | null
  artwork_path?: string | null
  relative_dir?: string  // set by analyze-folder handler, not the sidecar
}

export type ProgressEvent = {
  type: 'progress'
  current: number
  total: number
  file: string
}

function getSidecarPaths(): { python: string; analyzeScript: string | null; editScript: string | null } {
  if (is.dev) {
    const root = app.getAppPath()
    return {
      python: join(root, 'sidecar/.venv/bin/python3'),
      analyzeScript: join(root, 'sidecar/analyze.py'),
      editScript: join(root, 'sidecar/edit_tags.py'),
    }
  }
  return {
    python: join(process.resourcesPath, 'sidecar'),
    analyzeScript: null,
    editScript: null,
  }
}

export type EditTagsMeta = {
  title?: string
  artist?: string
  album?: string
  genre?: string
  bpm?: string
  key?: string
  year?: string
  remixer?: string
  grouping?: string
  composer?: string
  comment?: string
  label?: string
}

export type EditTagsResult = {
  success: boolean
  filepath: string
  serato_written?: boolean
  error?: string
}

function runScript(python: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.on('close', (code) => {
      if (code !== 0 && !stdout) reject(new Error(`Script exited with code ${code}`))
      else resolve(stdout)
    })
    child.on('error', (err) => reject(new Error(`Spawn failed: ${err.message}`)))
  })
}

export async function editTags(
  filepath: string,
  meta: EditTagsMeta,
  writeSerato = true
): Promise<EditTagsResult> {
  const { python, editScript } = getSidecarPaths()
  const args = editScript
    ? [editScript, filepath, '--meta', JSON.stringify(meta)]
    : [filepath, '--meta', JSON.stringify(meta)]
  if (!writeSerato) args.push('--no-serato')
  const stdout = await runScript(python, args)
  return JSON.parse(stdout) as EditTagsResult
}

export function analyzeFile(
  filepath: string,
  options: { writeBack?: boolean; onProgress?: (msg: ProgressEvent) => void } = {}
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const { python, analyzeScript } = getSidecarPaths()
    const args = analyzeScript ? [analyzeScript, filepath] : [filepath]
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
