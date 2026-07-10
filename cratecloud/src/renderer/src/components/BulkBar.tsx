import { useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { BulkEditModal } from './BulkEditModal'
import { MoveProgressModal, type MoveResult } from './MoveProgressModal'

export function BulkBar(): React.JSX.Element | null {
  const { selected, clearSelection, bulkMove, allTracks, openDeleteDialog, updateTrack, boards } =
    useLibraryStore()
  const [editOpen, setEditOpen] = useState(false)
  const [moveResults, setMoveResults] = useState<MoveResult[] | null>(null)
  const [moving, setMoving] = useState(false)

  if (selected.size === 0) return null

  const ids = [...selected]
  const n = ids.length

  const handleMoveFiles = async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    setMoving(true)
    const tracks = allTracks().filter((t) => ids.includes(t.id) && t.filepath)
    const results: MoveResult[] = []
    for (const track of tracks) {
      try {
        const newPath = await window.api.fs.moveFile(track.filepath!, folder)
        updateTrack(track.id, { filepath: newPath, folder: folder.split('/').pop() })
        results.push({ track, success: true, newPath })
      } catch (err) {
        results.push({ track, success: false, error: String(err) })
      }
    }
    setMoving(false)
    setMoveResults(results)
  }

  return (
    <>
      <div className="bulk-bar">
        <span>{n} track{n !== 1 ? 's' : ''} selected</span>
        <button className="bulk-btn accent" onClick={() => setEditOpen(true)}>✎ Edit</button>
        {boards.map((b) => (
          <button key={b.id} className="bulk-btn" onClick={() => bulkMove(b.name)}>
            <span className="bulk-board-dot" style={{ background: b.color }} />
            {b.name}
          </button>
        ))}
        <button className="bulk-btn" onClick={handleMoveFiles} disabled={moving}>
          {moving ? '…Moving' : '⤷ Move files'}
        </button>
        <button className="bulk-btn danger" onClick={() => openDeleteDialog(ids)}>🗑 Delete</button>
        <button className="bulk-btn danger" style={{ marginLeft: 'auto' }} onClick={clearSelection}>✕ Deselect</button>
      </div>
      {editOpen && <BulkEditModal onClose={() => setEditOpen(false)} />}
      {moveResults !== null && (
        <MoveProgressModal results={moveResults} onClose={() => setMoveResults(null)} />
      )}
    </>
  )
}
