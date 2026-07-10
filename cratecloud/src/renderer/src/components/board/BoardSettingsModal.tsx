import { useState } from 'react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import type { Board, Track } from '../../types/track'

const BOARD_COLORS = ['#7f77dd', '#378add', '#1d9e75', '#d85a30', '#d4537e', '#ba7517', '#3d9e9e', '#888888']

const CRITERIA_FIELDS = [
  { key: 'bpm', label: 'BPM' },
  { key: 'key', label: 'Key' },
  { key: 'genre', label: 'Genre' },
  { key: 'energy', label: 'Energy' },
  { key: 'artist', label: 'Artist' },
  { key: 'year', label: 'Year' },
  { key: 'album', label: 'Album' },
  { key: 'label', label: 'Label' },
]

type CriteriaMode = 'manual' | 'fallback' | 'auto'

function criteriaMode(criteria: string[] | null): CriteriaMode {
  if (criteria === null) return 'manual'
  if (criteria.length === 0) return 'fallback'
  return 'auto'
}

function criteriaLabel(criteria: string[] | null): string {
  if (criteria === null) return 'Manual'
  if (criteria.length === 0) return 'Fallback'
  return criteria.map((k) => CRITERIA_FIELDS.find((f) => f.key === k)?.label ?? k).join(', ')
}

type RowProps = {
  board: Board
  index: number
  total: number
  columns: Record<string, Track[]>
  allBoards: Board[]
  onMoveUp: () => void
  onMoveDown: () => void
}

function BoardRow({ board, index, total, columns, allBoards, onMoveUp, onMoveDown }: RowProps): React.JSX.Element {
  const { renameBoard, updateBoardColor, updateBoardCriteria, deleteBoard } = useLibraryStore()

  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(board.name)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [fallbackId, setFallbackId] = useState<number>(
    () => allBoards.find((b) => b.id !== board.id)?.id ?? -1
  )

  const mode = criteriaMode(board.criteria)
  const trackCount = columns[board.name]?.length ?? 0
  const others = allBoards.filter((b) => b.id !== board.id)

  const commitRename = async () => {
    const trimmed = renameVal.trim()
    setRenaming(false)
    if (!trimmed || trimmed === board.name) { setRenameVal(board.name); return }
    await renameBoard(board.id, board.name, trimmed)
  }

  const cycleColor = () => {
    const idx = BOARD_COLORS.indexOf(board.color)
    const next = BOARD_COLORS[(idx + 1) % BOARD_COLORS.length]
    void updateBoardColor(board.id, next)
  }

  const handleModeChange = (newMode: CriteriaMode) => {
    if (newMode === 'manual') void updateBoardCriteria(board.id, null)
    else if (newMode === 'fallback') void updateBoardCriteria(board.id, [])
    else {
      // Switch to auto — keep existing fields or default to bpm+key+genre
      const existing = board.criteria
      void updateBoardCriteria(board.id, existing?.length ? existing : ['bpm', 'key', 'genre'])
    }
  }

  const handleFieldToggle = (field: string) => {
    const current = board.criteria ?? []
    const next = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field]
    // Don't allow clearing all fields — auto needs at least one
    if (next.length === 0) return
    void updateBoardCriteria(board.id, next)
  }

  const handleDelete = async () => {
    const fallback = allBoards.find((b) => b.id === fallbackId)
    if (!fallback) return
    await deleteBoard(board.id, fallback.name)
    setDeleteConfirm(false)
  }

  return (
    <div className={`bsm-row${expanded ? ' bsm-row-expanded' : ''}`}>
      <div className="bsm-row-header">
        <div className="bsm-reorder">
          <button className="bsm-arrow" onClick={onMoveUp} disabled={index === 0} title="Higher priority">▲</button>
          <button className="bsm-arrow" onClick={onMoveDown} disabled={index === total - 1} title="Lower priority">▼</button>
        </div>

        <div className="bsm-color-swatch" style={{ background: board.color }} onClick={cycleColor} title="Click to change color" />

        {renaming ? (
          <input
            className="bsm-name-input"
            value={renameVal}
            autoFocus
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
              if (e.key === 'Escape') { setRenameVal(board.name); setRenaming(false) }
            }}
          />
        ) : (
          <span className="bsm-name" onDoubleClick={() => { setRenaming(true); setRenameVal(board.name) }} title="Double-click to rename">
            {board.name}
          </span>
        )}

        <span className="bsm-criteria-pill">{criteriaLabel(board.criteria)}</span>

        <button className="bsm-expand-btn" onClick={() => setExpanded((o) => !o)} title="Edit criteria">
          {expanded ? '▲' : '▼'}
        </button>

        <button
          className={`bsm-delete-btn${deleteConfirm ? ' active' : ''}`}
          onClick={() => setDeleteConfirm((o) => !o)}
          title="Delete board"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="bsm-criteria-editor">
          <label className="bsm-radio-row">
            <input type="radio" name={`bsm-mode-${board.id}`} checked={mode === 'manual'} onChange={() => handleModeChange('manual')} />
            <span>Manual only — tracks only move here when explicitly placed</span>
          </label>
          <label className="bsm-radio-row">
            <input type="radio" name={`bsm-mode-${board.id}`} checked={mode === 'fallback'} onChange={() => handleModeChange('fallback')} />
            <span>Fallback — receives tracks that match no other auto-board</span>
          </label>
          <label className="bsm-radio-row">
            <input type="radio" name={`bsm-mode-${board.id}`} checked={mode === 'auto'} onChange={() => handleModeChange('auto')} />
            <span>Auto-assign when all selected fields are non-empty:</span>
          </label>
          {mode === 'auto' && (
            <div className="bsm-fields">
              {CRITERIA_FIELDS.map((f) => (
                <label key={f.key} className="bsm-field-label">
                  <input
                    type="checkbox"
                    checked={board.criteria?.includes(f.key) ?? false}
                    onChange={() => handleFieldToggle(f.key)}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteConfirm && (
        <div className="bsm-delete-confirm">
          {trackCount > 0 ? (
            <>
              <span className="bsm-dc-msg">{trackCount} track(s) will move to:</span>
              <select
                className="bsm-dc-select"
                value={fallbackId}
                onChange={(e) => setFallbackId(Number(e.target.value))}
              >
                {others.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </>
          ) : (
            <span className="bsm-dc-msg">This board is empty and will be permanently deleted.</span>
          )}
          <div className="bsm-dc-actions">
            <button className="bsm-dc-cancel" onClick={() => setDeleteConfirm(false)}>Cancel</button>
            <button className="bsm-dc-confirm" onClick={() => void handleDelete()}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

type Props = { onClose: () => void }

export function BoardSettingsModal({ onClose }: Props): React.JSX.Element {
  const {
    boards, columns, reorderBoards, createBoard, recomputeAllAutoStatuses,
  } = useLibraryStore()

  const [recomputing, setRecomputing] = useState(false)
  const [addingBoard, setAddingBoard] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#7f77dd')

  const handleReorder = (fromIdx: number, toIdx: number) => {
    const reordered = [...boards]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    void reorderBoards(reordered.map((b, i) => ({ id: b.id, position: i })))
  }

  const handleAddBoard = async () => {
    const name = newName.trim()
    if (!name) return
    await createBoard(name, newColor)
    setNewName('')
    setNewColor('#7f77dd')
    setAddingBoard(false)
  }

  const handleRecompute = async () => {
    setRecomputing(true)
    try {
      await recomputeAllAutoStatuses()
    } finally {
      setRecomputing(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bsm-header">
          <span className="bsm-title">Board Settings</span>
          <div className="bsm-header-actions">
            <button
              className="bsm-recompute-btn"
              onClick={() => void handleRecompute()}
              disabled={recomputing}
              title="Recompute board placement for all non-pinned tracks"
            >
              {recomputing ? 'Recomputing…' : '↺ Recompute all auto'}
            </button>
            <button className="bsm-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="bsm-hint">
          Boards are checked top-to-bottom — higher boards have higher priority in auto-assignment.
          Double-click a name to rename it.
        </div>

        <div className="bsm-list">
          {boards.map((board, i) => (
            <BoardRow
              key={board.id}
              board={board}
              index={i}
              total={boards.length}
              columns={columns}
              allBoards={boards}
              onMoveUp={() => handleReorder(i, i - 1)}
              onMoveDown={() => handleReorder(i, i + 1)}
            />
          ))}
        </div>

        <div className="bsm-footer">
          {addingBoard ? (
            <div className="bsm-add-form">
              <input
                className="bsm-add-input"
                placeholder="Board name…"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddBoard()
                  if (e.key === 'Escape') setAddingBoard(false)
                }}
              />
              <div className="bsm-add-colors">
                {BOARD_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`bsm-add-swatch${newColor === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div className="bsm-add-actions">
                <button className="bsm-add-cancel" onClick={() => setAddingBoard(false)}>Cancel</button>
                <button className="bsm-add-confirm" onClick={() => void handleAddBoard()}>Add Board</button>
              </div>
            </div>
          ) : (
            <button className="bsm-add-btn" onClick={() => setAddingBoard(true)}>+ Add Board</button>
          )}
        </div>
      </div>
    </div>
  )
}
