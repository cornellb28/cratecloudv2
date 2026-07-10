import { useState, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Board, Track } from '../../types/track'
import { TrackCard } from './TrackCard'

type Props = {
  board: Board
  tracks: Track[]
  allBoards: Board[]
  onDelete: (board: Board) => void
}

export function BoardColumn({ board, tracks, allBoards, onDelete }: Props): React.JSX.Element {
  const { name, color } = board

  // Sortable for column header drag-to-reorder
  const {
    attributes, listeners, setNodeRef: setSortRef,
    transform, transition, isDragging: isColDragging,
  } = useSortable({
    id: board.id,
    data: { type: 'column', board },
  })

  // Droppable body for track drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-${name}`,
    data: { type: 'track-target', col: name },
  })

  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(name)
  const renameRef = useRef<HTMLInputElement>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isColDragging ? 0.5 : 1,
  }

  const commitRename = async () => {
    const trimmed = renameVal.trim()
    setRenaming(false)
    if (!trimmed || trimmed === name) { setRenameVal(name); return }
    // Rename is handled by parent via context — emit through store directly
    const { renameBoard } = await import('../../stores/useLibraryStore').then((m) => m.useLibraryStore.getState())
    await renameBoard(board.id, name, trimmed)
  }

  const handleHeaderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div ref={setSortRef} className="col" style={style}>
      <div
        className="col-header"
        onContextMenu={handleHeaderContextMenu}
        {...attributes}
        {...listeners}
      >
        <div className="col-header-dot" style={{ background: color }} />
        {renaming ? (
          <input
            ref={renameRef}
            className="col-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setRenameVal(name); setRenaming(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="col-title" onDoubleClick={() => { setRenaming(true); setRenameVal(name) }}>
            {name}
          </span>
        )}
        <span className="col-count">{tracks.length}</span>
      </div>

      <div ref={setDropRef} className={`col-body${isOver ? ' col-body-over' : ''}`}>
        {tracks.map((t) => (
          <TrackCard key={t.id} track={t} col={name} allBoards={allBoards} />
        ))}
        <div className={`col-drop-zone${isOver ? ' over' : ''}`}>Drop here</div>
      </div>

      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          <div className="ctx-item" onClick={() => { setRenaming(true); setRenameVal(name); setCtxMenu(null) }}>
            Rename board…
          </div>
          <div
            className="ctx-item ctx-danger"
            onClick={() => { onDelete(board); setCtxMenu(null) }}
          >
            Delete board…
          </div>
        </div>
      )}
    </div>
  )
}
