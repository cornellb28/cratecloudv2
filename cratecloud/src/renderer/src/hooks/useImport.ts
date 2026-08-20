import { useCallback, useRef } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useFolderStore } from '../stores/useFolderStore'
import { usePlanLimits } from './usePlanLimits'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aiff', '.aif', '.m4a', '.ogg'])

function getExt(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot).toLowerCase() : ''
}

export function useImport() {
  const { addTracks, setImportStatus, allTracks } = useLibraryStore()
  const { init: reinitFolders } = useFolderStore()
  const { trackLimit } = usePlanLimits()
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
        let capSkipped = 0
        let capSkippedFolders = 0
        let remaining = Math.max(0, trackLimit - allTracks().length)

        const audioFiles = files.filter((p) => AUDIO_EXTENSIONS.has(getExt(p)))

        for (const folderPath of folders) {
          if (remaining <= 0) { capSkippedFolders++; continue }
          const rootName = folderPath.split('/').pop() ?? folderPath

          // Tracks now stream in one at a time via onAnalyzeFolderTrack as
          // each file finishes analyzing (folder_id is already resolved
          // server-side, from an up-front ensureFolderTree call inside the
          // analyze-folder handler) — this is what shows tracks appearing
          // live during a large folder import instead of one batch reveal
          // at the end. Chained onto addQueue so each DB insert completes
          // before the next starts, since addTracks reads/writes the store's
          // columns non-atomically and concurrent calls could race.
          let addQueue: Promise<void> = Promise.resolve()
          const removeProgressListener = window.api.onAnalyzeProgress((p) => {
            setImportStatus({ current: p.current, total: p.total, label: p.file })
          })
          const removeTrackListener = window.api.onAnalyzeFolderTrack((r) => {
            const isDuplicate = !!r.filepath && knownPaths.has(r.filepath)
            if (isDuplicate) { skipped++; return }
            if (remaining <= 0) { capSkipped++; return }
            remaining--
            addQueue = addQueue.then(() => addTracks([r], rootName))
          })
          try {
            await window.api.analyzeFolder(folderPath)
            await addQueue
            await reinitFolders()
          } finally {
            removeProgressListener()
            removeTrackListener()
          }
        }

        // Filter individual files before analyzing — avoids running Python on known paths
        const dedupedFiles = audioFiles.filter((p) => !knownPaths.has(p))
        skipped += audioFiles.length - dedupedFiles.length
        const newAudioFiles = dedupedFiles.slice(0, remaining)
        capSkipped += dedupedFiles.length - newAudioFiles.length
        remaining -= newAudioFiles.length

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

        if (capSkipped > 0 || capSkippedFolders > 0) {
          const parts = [
            capSkipped > 0 ? `${capSkipped} track${capSkipped > 1 ? 's' : ''}` : null,
            capSkippedFolders > 0 ? `${capSkippedFolders} folder${capSkippedFolders > 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(' and ')
          setImportStatus({
            current: 0,
            total: 0,
            label: `Free plan limit reached (${trackLimit} tracks) — ${parts} not imported. Upgrade to Pro for unlimited tracks.`,
          })
          await new Promise((r) => setTimeout(r, 3000))
        }
      } finally {
        setImportStatus(null)
        busyRef.current = false
      }
    },
    [addTracks, setImportStatus, allTracks, reinitFolders, trackLimit],
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
