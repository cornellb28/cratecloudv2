import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { BulkEditModal } from './BulkEditModal'
import { MoveProgressModal, type MoveResult } from './MoveProgressModal'
import { LockBadge } from './LockBadge'
import { usePlanLimits } from '../hooks/usePlanLimits'
import { CRATE_COLORS } from '../types/track'

// Bulk equivalent of CratePicker — that component is per-track (checkbox
// membership against a single trackId), which doesn't make sense across a
// mixed selection. This just adds every selected track to whichever crate
// is clicked; addTracksToCrate already dedupes existing members on the
// backend, so re-adding a track that's already in the crate is a no-op.
function BulkCratePicker({
  trackIds,
  anchorRef,
  onClose
}: {
  trackIds: number[]
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}): React.JSX.Element | null {
  const { crates, addTracksToCrate, createCrate } = useLibraryStore()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPos({ left: Math.min(rect.left, window.innerWidth - 212), top: rect.bottom + 8 })
  }, [anchorRef])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchorRef.current?.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  const handleAdd = async (crateId: number): Promise<void> => {
    await addTracksToCrate(crateId, trackIds)
    onClose()
  }

  const handleCreateCrate = async (): Promise<void> => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = await createCrate(trimmed, CRATE_COLORS[0])
    await addTracksToCrate(id, trackIds)
    onClose()
  }

  if (!pos) return null

  return (
    <div
      ref={ref}
      className="crate-picker"
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="crate-picker-list">
        {crates.length === 0 && <div className="crate-picker-empty">No crates yet.</div>}
        {crates.map((c) => (
          <div key={c.id} className="crate-picker-row" onClick={() => void handleAdd(c.id)}>
            <span className="crate-picker-dot" style={{ background: c.color }} />
            <span className="crate-picker-name">{c.name}</span>
            <span className="crate-picker-count">{c.trackIds.size}</span>
          </div>
        ))}
      </div>
      <div className="crate-picker-sep" />
      {creating ? (
        <input
          className="crate-picker-new-input"
          value={newName}
          autoFocus
          placeholder="Crate name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleCreateCrate()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setCreating(false)
              setNewName('')
            }
          }}
          onBlur={() => {
            if (!newName.trim()) setCreating(false)
          }}
        />
      ) : (
        <div className="crate-picker-row crate-picker-add" onClick={() => setCreating(true)}>
          + New crate
        </div>
      )}
    </div>
  )
}

export function BulkBar(): React.JSX.Element | null {
  const { selected, clearSelection, bulkMove, allTracks, openDeleteDialog, updateTrack, boards } =
    useLibraryStore()
  const { isLocked } = usePlanLimits()
  const [editOpen, setEditOpen] = useState(false)
  const [moveResults, setMoveResults] = useState<MoveResult[] | null>(null)
  const [moving, setMoving] = useState(false)
  const [cratePickerOpen, setCratePickerOpen] = useState(false)
  const crateBtnRef = useRef<HTMLButtonElement>(null)

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
        <LockBadge locked={isLocked('bulkEdit')} featureName="Bulk Edit">
          <button className="bulk-btn accent" onClick={() => setEditOpen(true)}>✎ Edit</button>
        </LockBadge>
        {boards.map((b) => (
          <button key={b.id} className="bulk-btn" onClick={() => bulkMove(b.name)}>
            <span className="bulk-board-dot" style={{ background: b.color }} />
            {b.name}
          </button>
        ))}
        <button className="bulk-btn" onClick={handleMoveFiles} disabled={moving}>
          {moving ? '…Moving' : '⤷ Move files'}
        </button>
        <button
          ref={crateBtnRef}
          className="bulk-btn"
          onClick={() => setCratePickerOpen(!cratePickerOpen)}
        >
          + Add to crate
        </button>
        <button className="bulk-btn danger" onClick={() => openDeleteDialog(ids)}>🗑 Delete</button>
        <button className="bulk-btn danger" style={{ marginLeft: 'auto' }} onClick={clearSelection}>✕ Deselect</button>
      </div>
      {editOpen && <BulkEditModal onClose={() => setEditOpen(false)} />}
      {cratePickerOpen && (
        <BulkCratePicker
          trackIds={ids}
          anchorRef={crateBtnRef}
          onClose={() => setCratePickerOpen(false)}
        />
      )}
      {moveResults !== null && (
        <MoveProgressModal results={moveResults} onClose={() => setMoveResults(null)} />
      )}
    </>
  )
}
