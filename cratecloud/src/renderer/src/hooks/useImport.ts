import { useCallback, useRef } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useFolderStore } from '../stores/useFolderStore'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

function getExt(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

export function useImport() {
  const { addTracks, setImportStatus, allTracks } = useLibraryStore()
  const { init: reinitFolders } = useFolderStore()
  const busyRef = useRef(false)

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (busyRef.current || !paths.length) return
      busyRef.current = true

      try {
        setImportStatus({ current: 0, total: 0, label: 'Classifying…' })
        const { files, folders } = await window.api.fs.classifyDropped(paths)

        // Build a set of every filepath already in the library
        const knownPaths = new Set(
          allTracks()
            .map((t) => t.filepath)
            .filter((p): p is string => !!p),
        )

        let skipped = 0

        const audioFiles = files.filter((p) => AUDIO_EXTENSIONS.has(getExt(p)))

        for (const folderPath of folders) {
          const rootName = folderPath.split('/').pop() ?? folderPath
          const removeListener = window.api.onAnalyzeProgress((p) => {
            setImportStatus({ current: p.current, total: p.total, label: p.file })
          })
          try {
            const results = await window.api.analyzeFolder(folderPath)
            const fresh = results.filter((r) => !r.filepath || !knownPaths.has(r.filepath))
            skipped += results.length - fresh.length
            if (fresh.length) {
              // Build folder tree in DB and map each result to its folder_id
              const relativeDirs = [...new Set(fresh.map((r) => r.relative_dir ?? ''))]
              const folderIdMap = await window.api.folders.ensureTree(rootName, relativeDirs)
              await reinitFolders()
              const withFolderIds = fresh.map((r) => ({
                ...r,
                folder_id: folderIdMap[r.relative_dir ?? ''] ?? null,
              }))
              await addTracks(withFolderIds, rootName)
            }
          } finally {
            removeListener()
          }
        }

        // Filter individual files before analyzing — avoids running Python on known paths
        const newAudioFiles = audioFiles.filter((p) => !knownPaths.has(p))
        skipped += audioFiles.length - newAudioFiles.length

        if (newAudioFiles.length > 0) {
          const total = newAudioFiles.length
          const pending = [...newAudioFiles]
          let completed = 0
          const CONCURRENCY = 4

          await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
              while (pending.length) {
                const filepath = pending.shift()!
                const name = filepath.split('/').pop() ?? ''
                setImportStatus({ current: completed + 1, total, label: name })
                const result = await window.api.analyzeFile(filepath)
                completed++
                await addTracks([result])
              }
            })
          )
        }

        if (skipped > 0) {
          setImportStatus({
            current: 0,
            total: 0,
            label: `${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`,
          })
          await new Promise((r) => setTimeout(r, 2000))
        }
      } finally {
        setImportStatus(null)
        busyRef.current = false
      }
    },
    [addTracks, setImportStatus, allTracks, reinitFolders],
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
