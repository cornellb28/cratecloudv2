import { useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { BulkEditModal } from './BulkEditModal'

export function BulkBar(): React.JSX.Element | null {
  const { selected, clearSelection, bulkMove, allTracks, openDeleteDialog, updateTrack } =
    useLibraryStore()
  const [editOpen, setEditOpen] = useState(false)

  if (selected.size === 0) return null

  const ids = [...selected]
  const n = ids.length

  const handleMoveFiles = async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    const tracks = allTracks().filter((t) => ids.includes(t.id) && t.filepath)
    for (const track of tracks) {
      try {
        const newPath = await window.api.fs.moveFile(track.filepath!, folder)
        updateTrack(track.id, { filepath: newPath, folder: folder.split('/').pop() })
      } catch (err) {
        console.error('Move failed for', track.filepath, err)
      }
    }
  }

  return (
    <>
      <div className="bulk-bar">
        <span>{n} track{n !== 1 ? 's' : ''} selected</span>
        <button className="bulk-btn accent" onClick={() => setEditOpen(true)}>✎ Edit</button>
        <button className="bulk-btn" onClick={() => bulkMove('Crate ready')}>→ Crate ready</button>
        <button className="bulk-btn" onClick={() => bulkMove('Gig ready')}>→ Gig ready</button>
        <button className="bulk-btn" onClick={handleMoveFiles}>⤷ Move files</button>
        <button className="bulk-btn danger" onClick={() => openDeleteDialog(ids)}>🗑 Delete</button>
        <button className="bulk-btn danger" style={{ marginLeft: 'auto' }} onClick={clearSelection}>✕ Deselect</button>
      </div>
      {editOpen && <BulkEditModal onClose={() => setEditOpen(false)} />}
    </>
  )
}
