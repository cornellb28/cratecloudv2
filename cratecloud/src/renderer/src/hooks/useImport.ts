import { useCallback, useRef } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

function getExt(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

export function useImport() {
  const { addTracks, setImportStatus } = useLibraryStore()
  const busyRef = useRef(false)

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (busyRef.current || !paths.length) return
      busyRef.current = true

      try {
        setImportStatus({ current: 0, total: 0, label: 'Classifying…' })
        const { files, folders } = await window.api.fs.classifyDropped(paths)
        const audioFiles = files.filter((p) => AUDIO_EXTENSIONS.has(getExt(p)))

        for (const folderPath of folders) {
          const folderName = folderPath.split('/').pop() ?? folderPath
          const removeListener = window.api.onAnalyzeProgress((p) => {
            setImportStatus({ current: p.current, total: p.total, label: p.file })
          })
          try {
            const results = await window.api.analyzeFolder(folderPath)
            await addTracks(results, folderName)
          } finally {
            removeListener()
          }
        }

        for (let i = 0; i < audioFiles.length; i++) {
          const name = audioFiles[i].split('/').pop() ?? ''
          setImportStatus({ current: i + 1, total: audioFiles.length, label: name })
          const result = await window.api.analyzeFile(audioFiles[i])
          await addTracks([result])
        }
      } finally {
        setImportStatus(null)
        busyRef.current = false
      }
    },
    [addTracks, setImportStatus],
  )

  const importFromDialog = useCallback(
    async (mode: 'folder' | 'files') => {
      if (busyRef.current) return
      if (mode === 'folder') {
        const folder = await window.api.dialog.openFolder()
        if (folder) await importPaths([folder])
      } else {
        const picked = await window.api.dialog.openFiles()
        if (picked.length) await importPaths(picked)
      }
    },
    [importPaths],
  )

  return { importPaths, importFromDialog }
}
