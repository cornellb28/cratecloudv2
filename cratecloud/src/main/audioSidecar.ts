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
  partial_hash?: string | null  // set by the analyze-file/analyze-folder handlers, not the sidecar
  last_modified?: number | null  // real on-disk mtime (epoch seconds), set by the handlers, not the sidecar
  folder_id?: number | null  // resolved by analyze-folder handler from its up-front ensureFolderTree call
}

export type ProgressEvent = {
  type: 'progress'
  current: number
  total: number
  file: string
}

// Dev: the raw venv interpreter + script (sidecar/build.sh isn't involved).
// Prod: two standalone PyInstaller executables built by sidecar/build.sh and
// bundled via electron-builder's extraResources into resources/sidecar/ —
// each one IS the interpreter+script combined, so there's no script path to
// pass, just the file's own args.
function getSidecarPaths(): { analyzeCmd: string; analyzeArgs: string[]; editCmd: string; editArgs: string[] } {
  if (is.dev) {
    const root = app.getAppPath()
    const python = join(root, 'sidecar/.venv/bin/python3')
    return {
      analyzeCmd: python,
      analyzeArgs: [join(root, 'sidecar/analyze.py')],
      editCmd: python,
      editArgs: [join(root, 'sidecar/edit_tags.py')],
    }
  }
  const ext = process.platform === 'win32' ? '.exe' : ''
  return {
    analyzeCmd: join(process.resourcesPath, 'sidecar', `analyze${ext}`),
    analyzeArgs: [],
    editCmd: join(process.resourcesPath, 'sidecar', `edit_tags${ext}`),
    editArgs: [],
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
  const { editCmd, editArgs } = getSidecarPaths()
  const args = [...editArgs, filepath, '--meta', JSON.stringify(meta)]
  if (!writeSerato) args.push('--no-serato')
  const stdout = await runScript(editCmd, args)
  return JSON.parse(stdout) as EditTagsResult
}

export type ProbeResult = {
  success: boolean
  filepath: string
  file_size_mb?: number
  duration_sec?: number
  error?: string
}

// Cheap header-only size+duration check — no audio decode. Used only as a
// match signal during orphan reconciliation, never for tagging/analysis.
export async function probeFile(filepath: string): Promise<ProbeResult> {
  const { analyzeCmd, analyzeArgs } = getSidecarPaths()
  const args = [...analyzeArgs, filepath, '--probe']
  const stdout = await runScript(analyzeCmd, args)
  return JSON.parse(stdout) as ProbeResult
}

export function analyzeFile(
  filepath: string,
  options: { writeBack?: boolean; onProgress?: (msg: ProgressEvent) => void } = {}
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const { analyzeCmd, analyzeArgs } = getSidecarPaths()
    const args = [...analyzeArgs, filepath]
    if (options.writeBack) args.push('--write-back')

    const child = spawn(analyzeCmd, args, {
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
