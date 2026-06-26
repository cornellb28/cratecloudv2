import { useState, useEffect, useRef } from 'react'
import { useImport } from '../hooks/useImport'
import { useLibraryStore } from '../stores/useLibraryStore'

export function DropOverlay(): React.JSX.Element | null {
  const [isDragging, setIsDragging] = useState(false)
  const [itemCount, setItemCount] = useState(0)
  const dragCounter = useRef(0)
  const { importPaths } = useImport()
  const importStatus = useLibraryStore((s) => s.importStatus)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      dragCounter.current++
      setItemCount(e.dataTransfer.items.length)
      setIsDragging(true)
    }

    const onDragLeave = () => {
      dragCounter.current--
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        setIsDragging(false)
      }
    }

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }

    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDragging(false)
      if (!e.dataTransfer?.files.length) return
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => (f as File & { path: string }).path)
        .filter(Boolean)
      if (paths.length) importPaths(paths)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [importPaths])

  // Don't show while an import is already running
  if (!isDragging || importStatus !== null) return null

  return (
    <div className="drop-overlay">
      <div className="drop-zone">
        <div className="drop-icon">⬇</div>
        <div className="drop-title">Drop to import</div>
        <div className="drop-sub">
          {itemCount > 1 ? `${itemCount} items` : 'files or folders'}
          {' '}· BPM &amp; key analyzed automatically
        </div>
      </div>
    </div>
  )
}
