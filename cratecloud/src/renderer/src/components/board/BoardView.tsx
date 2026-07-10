import { useState, useMemo } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, pointerWithin,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useFolderStore } from '../../stores/useFolderStore'
import { BoardColumn } from './BoardColumn'
import type { Board, Track } from '../../types/track'
import { matchesTrack, matchesTagFilters } from '../../utils/searchFilter'

const BOARD_COLORS = ['#7f77dd', '#378add', '#1d9e75', '#d85a30', '#d4537e', '#ba7517', '#3d9e9e', '#888888']

type DeleteDialog = { board: Board; fallbackId: number }

export function BoardView(): React.JSX.Element {
  const {
    columns, boards, moveTrack, reorderBoards, deleteBoard, createBoard,
    searchQuery, advancedFilters, activeFilter, activeTagFilters,
    activeCrateId, crates, activeFolderId,
  } = useLibraryStore()
  const { allDescendantIds } = useFolderStore()

  const [boardSearch, setBoardSearch] = useState('')
  const [addingBoard, setAddingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardColor, setNewBoardColor] = useState('#7f77dd')
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null)
  const [activeColId, setActiveColId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeCrate = activeCrateId !== null ? (crates.find((c) => c.id === activeCrateId) ?? null) : null
  const activeFolderIds = activeFolderId !== null ? allDescendantIds(activeFolderId) : null

  const isFiltering = searchQuery.trim() !== ''
    || Object.values(advancedFilters).some(Boolean)
    || activeFilter === 'Untagged'
    || activeTagFilters.length > 0
    || activeCrate !== null
    || activeFolderIds !== null

  const filteredBoards = useMemo(
    () => boardSearch.trim()
      ? boards.filter((b) => b.name.toLowerCase().includes(boardSearch.toLowerCase()))
      : boards,
    [boards, boardSearch]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; board?: Board } | undefined
    if (data?.type === 'column' && data.board) setActiveColId(data.board.id)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveColId(null)
    const { active, over } = event
    if (!over) return

    const dragData = active.data.current as { type?: string; track?: Track; col?: string; board?: Board } | undefined
    const dropData = over.data.current as { type?: string; col?: string } | undefined

    if (dragData?.type === 'column') {
      if (active.id === over.id) return
      const oldIdx = boards.findIndex((b) => b.id === active.id)
      const newIdx = boards.findIndex((b) => b.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(boards, oldIdx, newIdx)
      reorderBoards(reordered.map((b, i) => ({ id: b.id, position: i })))
    } else if (dragData?.type === 'track') {
      const fromCol = dragData.col
      const toCol = dropData?.col
      if (!fromCol || !toCol || fromCol === toCol) return
      moveTrack(dragData.track!.id, fromCol, toCol)
    }
  }

  const handleAddBoard = async () => {
    const name = newBoardName.trim()
    if (!name) return
    await createBoard(name, newBoardColor)
    setNewBoardName('')
    setNewBoardColor('#7f77dd')
    setAddingBoard(false)
  }

  const handleDeleteRequest = (board: Board) => {
    const others = boards.filter((b) => b.id !== board.id)
    setDeleteDialog({ board, fallbackId: others[0]?.id ?? -1 })
  }

  const handleConfirmDelete = async () => {
    if (!deleteDialog) return
    const fallback = boards.find((b) => b.id === deleteDialog.fallbackId)
    if (!fallback) return
    await deleteBoard(deleteDialog.board.id, fallback.name)
    setDeleteDialog(null)
  }

  const activeColBoard = activeColId !== null ? boards.find((b) => b.id === activeColId) : undefined

  return (
    <div className="board-view-wrap">
      <div className="board-toolbar">
        <input
          className="board-search"
          placeholder="Search boards…"
          value={boardSearch}
          onChange={(e) => setBoardSearch(e.target.value)}
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={boards.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
          <div className="board">
            {filteredBoards.map((board) => {
              const tracks = columns[board.name] ?? []
              const visible = isFiltering
                ? tracks.filter((t) => {
                    if (activeCrate && !activeCrate.trackIds.has(t.id)) return false
                    if (activeFolderIds && !activeFolderIds.has(t.folder_id ?? -1)) return false
                    if (activeFilter === 'Untagged' && t.bpm && t.key) return false
                    if (!matchesTrack(t, searchQuery, advancedFilters)) return false
                    return matchesTagFilters(t, activeTagFilters)
                  })
                : tracks
              return (
                <BoardColumn
                  key={board.id}
                  board={board}
                  tracks={visible}
                  allBoards={boards}
                  onDelete={handleDeleteRequest}
                />
              )
            })}

            {!boardSearch.trim() && (
              <div className="col col-new-board">
                {addingBoard ? (
                  <div className="col-add-form">
                    <input
                      className="col-add-input"
                      placeholder="Board name…"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { void handleAddBoard() }
                        if (e.key === 'Escape') { setAddingBoard(false) }
                      }}
                      autoFocus
                    />
                    <div className="col-add-colors">
                      {BOARD_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`col-add-swatch${newBoardColor === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setNewBoardColor(c)}
                        />
                      ))}
                    </div>
                    <div className="col-add-actions">
                      <button className="col-add-confirm" onClick={() => { void handleAddBoard() }}>Add</button>
                      <button className="col-add-cancel" onClick={() => setAddingBoard(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="col-new-btn" onClick={() => setAddingBoard(true)}>
                    + New Board
                  </button>
                )}
              </div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeColBoard && (
            <div className="col col-ghost">
              <div className="col-header">
                <div className="col-header-dot" style={{ background: activeColBoard.color }} />
                <span className="col-title">{activeColBoard.name}</span>
                <span className="col-count">{columns[activeColBoard.name]?.length ?? 0}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {deleteDialog && (
        <div className="modal-overlay" onClick={() => setDeleteDialog(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Delete "{deleteDialog.board.name}"?</div>
            {(columns[deleteDialog.board.name]?.length ?? 0) > 0 ? (
              <>
                <p className="modal-msg">
                  {columns[deleteDialog.board.name].length} track(s) will be moved to:
                </p>
                <select
                  className="modal-select"
                  value={deleteDialog.fallbackId}
                  onChange={(e) =>
                    setDeleteDialog((d) => d ? { ...d, fallbackId: Number(e.target.value) } : d)
                  }
                >
                  {boards.filter((b) => b.id !== deleteDialog.board.id).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <p className="modal-msg">This board is empty. It will be permanently deleted.</p>
            )}
            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={() => setDeleteDialog(null)}>Cancel</button>
              <button className="modal-btn-danger" onClick={() => { void handleConfirmDelete() }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
