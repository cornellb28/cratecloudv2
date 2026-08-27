import { useState, useRef } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, pointerWithin,
  DragOverlay,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useFolderStore, type FolderNode } from '../stores/useFolderStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useTrackCardActions } from '../hooks/useTrackCardActions'
import { useLeaveTransition } from '../hooks/useLeaveTransition'
import type { Track } from '../types/track'
import { MoveProgressModal, type MoveResult } from './MoveProgressModal'
import { TrackEditorModal } from './TrackEditorModal'
import { CratePicker } from './CratePicker'
import { InlineGenreEditor } from './InlineGenreEditor'

// ── Drag data types ──────────────────────────────────────────────────────────
type DragData =
  | { type: 'folder'; id: number }
  | { type: 'track'; id: number; currentFolderId: number | undefined }

// Last successful batch, kept for a single-level "Undo" — cleared after use
// or after the next move. Mirrors the shape folder:undoMoveBatch expects.
type UndoEntry = { trackId: number; oldFilepath?: string; newFilepath?: string; oldFolderId: number | null }

// ── FolderRow: droppable + draggable folder node ──────────────────────────────
function FolderRow({
  folder,
  depth,
  expanded,
  onToggle,
  onSelect,
  isActive,
  isOver,
  trackCount,
  hasMissing,
}: {
  folder: FolderNode
  depth: number
  expanded: boolean
  onToggle: () => void
  onSelect: () => void
  isActive: boolean
  isOver: boolean
  trackCount: number
  hasMissing: boolean
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', id: folder.id } satisfies DragData,
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `folder-drop-${folder.id}`,
    data: { folderId: folder.id },
  })

  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(folder.name)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const { renameFolder, deleteFolder } = useFolderStore()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const commitRename = async (): Promise<void> => {
    const trimmed = renameVal.trim()
    if (!trimmed || trimmed === folder.name) { setRenaming(false); return }
    try {
      await renameFolder(folder.id, trimmed)
      setRenaming(false)
    } catch (err) {
      // Real disk rename can fail (permission, collision, cross-device) —
      // keep the input open with the attempted value so the user can retry
      // rather than silently reverting.
      setRenameError(err instanceof Error ? err.message : String(err))
      setTimeout(() => setRenameError(null), 4000)
    }
  }

  const setRef = (el: HTMLElement | null): void => {
    setDragRef(el)
    setDropRef(el)
  }

  return (
    <>
      <div
        ref={setRef}
        className={`fhv-folder-row${isOver ? ' fhv-drop-over' : ''}${isDragging ? ' fhv-dragging' : ''}${isActive ? ' fhv-folder-active' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={onSelect}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
        {...attributes}
        {...listeners}
      >
        <span
          className="fhv-folder-arrow"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        {renaming ? (
          <input
            ref={renameInputRef}
            className="fhv-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setRenameVal(folder.name); setRenaming(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="fhv-folder-name">{folder.name}</span>
        )}
        {!folder.path && (
          <span className="fhv-folder-nopath" title="No known disk location — dropping tracks here only reorganizes them in CrateCloud, the file stays put">○</span>
        )}
        {hasMissing && (
          <span className="fhv-folder-missing" title="Contains a track CrateCloud can't find on disk — see Settings → Rescan Library">⚠</span>
        )}
        {trackCount > 0 && <span className="fhv-folder-count">{trackCount}</span>}
      </div>

      {renameError && (
        <div className="fhv-folder-row" style={{ paddingLeft: 12 + depth * 16 }}>
          <span className="fhv-rename-error">{renameError}</span>
        </div>
      )}

      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          <div className="ctx-item" onClick={() => { setRenaming(true); setCtxMenu(null) }}>
            Rename…
          </div>
          <div
            className="ctx-item ctx-danger"
            onClick={() => { deleteFolder(folder.id); setCtxMenu(null) }}
          >
            Delete folder
          </div>
        </div>
      )}
    </>
  )
}

// ── TrackRow: draggable leaf item ─────────────────────────────────────────────
// Drag-to-move-folder (useDraggable below) is this view's own mechanism,
// untouched. Everything else (rename, move-to-folder-picker, add-to-crate,
// inline genre edit, context menu, click-to-Inspector, missing state) comes
// from the same useTrackCardActions hook TrackCard uses — see Section 3 —
// so this stays in sync with every other track surface without being
// forced into TrackCard's <tr>-shaped list mode, which doesn't fit a
// variable-depth drag-and-drop tree.
function TrackRow({
  track,
  depth,
  leaving
}: {
  track: Track
  depth: number
  leaving?: boolean
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { type: 'track', id: track.id, currentFolderId: track.folder_id } satisfies DragData,
  })
  const {
    isSelected, isMissing, isRenaming, modalOpen, setModalOpen,
    cratePickerOpen, setCratePickerOpen, crateBtnRef, moveError, renameValue, setRenameValue,
    renameError, setRenameError, genreEditorOpen, setGenreEditorOpen, genreError,
    startRename, commitRename, cancelRename, handleMoveToFolder, handleGenreSelect,
    handleToggleSelect, handleRowClick, handleContextMenu,
  } = useTrackCardActions(track)

  return (
    <>
      <div
        ref={setNodeRef}
        className={`fhv-track-row${isDragging ? ' fhv-dragging' : ''}${isSelected ? ' fhv-track-selected' : ''}${leaving ? ' fhv-track-leaving' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={handleRowClick}
        onContextMenu={handleContextMenu}
        {...attributes}
        {...listeners}
      >
        <div
          className={`lib-check fhv-track-check${isSelected ? ' checked' : ''}`}
          onClick={handleToggleSelect}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isSelected && <span>✓</span>}
        </div>
        <span className="fhv-track-icon">♪</span>
        {isRenaming ? (
          <div
            className="card-rename-wrap"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              className="ca-input"
              value={renameValue}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') { e.preventDefault(); void commitRename() }
                if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
              }}
              onBlur={cancelRename}
            />
            {renameError && <div className="lm-rename-error">{renameError}</div>}
          </div>
        ) : (
          <>
            <span className="fhv-track-title">{track.title}</span>
            {track.artist && <span className="fhv-track-artist"> — {track.artist}</span>}
            {track.bpm && <span className="fhv-track-bpm">{track.bpm}</span>}
            {track.genre && (
              <span
                className="tag genre ige-trigger"
                onClick={(e) => { e.stopPropagation(); setGenreEditorOpen(true) }}
              >
                {track.genre} <span className="ige-chevron">▾</span>
                {genreEditorOpen && (
                  <InlineGenreEditor
                    value={track.genre}
                    onSelect={(v) => void handleGenreSelect(v)}
                    onClose={() => setGenreEditorOpen(false)}
                  />
                )}
              </span>
            )}
            {isMissing && <span className="tag missing" title="File not found on disk">⚠ Missing</span>}
            {moveError && <span className="fhv-rename-error">{moveError}</span>}
            {genreError && <span className="fhv-rename-error">{genreError}</span>}
          </>
        )}
        {!isRenaming && (
          <div
            className="fhv-track-actions"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="chab" onClick={startRename} disabled={!track.filepath} title="Rename file" type="button">✎</button>
            <button className="chab" onClick={() => void handleMoveToFolder()} disabled={!track.filepath} title="Move to folder" type="button">📁</button>
            <button ref={crateBtnRef} className="chab" onClick={() => setCratePickerOpen(!cratePickerOpen)} title="Add to crate" type="button">+</button>
            <button className="chab" onClick={handleContextMenu} title="More actions" type="button">⋯</button>
          </div>
        )}
        {cratePickerOpen && (
          <CratePicker trackId={track.id} anchorRef={crateBtnRef} onClose={() => setCratePickerOpen(false)} />
        )}
      </div>
      {modalOpen && <TrackEditorModal track={track} onClose={() => setModalOpen(false)} />}
    </>
  )
}

// ── UnassignedDropZone: tracks without a folder ───────────────────────────────
function UnassignedDropZone({ tracks: rawTracks }: { tracks: Track[] }): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: 'folder-drop-unassigned',
    data: { folderId: null },
  })
  const [expanded, setExpanded] = useState(false)
  const tracks = useLeaveTransition(rawTracks)

  return (
    <div>
      <div
        ref={setNodeRef}
        className={`fhv-folder-row${isOver ? ' fhv-drop-over' : ''}`}
        style={{ paddingLeft: 12 }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="fhv-folder-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="fhv-folder-name fhv-folder-dim">Unassigned ({rawTracks.length})</span>
      </div>
      {expanded && tracks.map((t) => <TrackRow key={t.id} track={t} depth={1} leaving={t.leaving} />)}
    </div>
  )
}

// ── Recursive folder subtree ──────────────────────────────────────────────────
function FolderSubtree({
  folder,
  allFolders,
  allTracks,
  depth,
  activeDropId,
  activeFolderId,
  onSelectFolder,
  trackCountByFolder,
  subtreeHasMissing,
}: {
  folder: FolderNode
  allFolders: FolderNode[]
  allTracks: Track[]
  depth: number
  activeDropId: string | null
  activeFolderId: number | null
  onSelectFolder: (id: number) => void
  trackCountByFolder: Map<number, number>
  subtreeHasMissing: Map<number, boolean>
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const isOver = activeDropId === `folder-drop-${folder.id}`
  const children = allFolders.filter((f) => f.parent_folder_id === folder.id)
  const rawTracks = allTracks.filter((t) => t.folder_id === folder.id)
  const tracks = useLeaveTransition(rawTracks)

  return (
    <div>
      <FolderRow
        folder={folder}
        depth={depth}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        onSelect={() => onSelectFolder(folder.id)}
        isActive={activeFolderId === folder.id}
        isOver={isOver}
        trackCount={trackCountByFolder.get(folder.id) ?? 0}
        hasMissing={subtreeHasMissing.get(folder.id) ?? false}
      />
      {expanded && (
        <div>
          {children.map((child) => (
            <FolderSubtree
              key={child.id}
              folder={child}
              allFolders={allFolders}
              allTracks={allTracks}
              depth={depth + 1}
              activeDropId={activeDropId}
              activeFolderId={activeFolderId}
              onSelectFolder={onSelectFolder}
              trackCountByFolder={trackCountByFolder}
              subtreeHasMissing={subtreeHasMissing}
            />
          ))}
          {tracks.map((t) => (
            <TrackRow key={t.id} track={t} depth={depth + 1} leaving={t.leaving} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
// MOBILE TODO: Deep folder nesting breaks on small screens.
// Replace with a native-style drill-down stack:
// each folder tap pushes a new full-screen list view.
// Back button in header navigates up.
export function FolderHierarchyView(): React.JSX.Element {
  const { folders, createFolderOnDisk, moveFolder } = useFolderStore()
  const { allTracks, setTrackFolder, selected, activeFolderId, setActiveFolder } = useLibraryStore()
  const tracks = allTracks()

  const [activeDropId, setActiveDropId] = useState<string | null>(null)
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveResults, setMoveResults] = useState<MoveResult[] | null>(null)
  const [lastMoveBatch, setLastMoveBatch] = useState<UndoEntry[] | null>(null)
  const [folderMoveError, setFolderMoveError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const roots = folders.filter((f) => f.parent_folder_id === null)
  const unassigned = tracks.filter((t) => t.folder_id == null)

  // Direct track count per folder, and whether a folder or any descendant
  // has a track marked missing_since — computed once per render, O(folders + tracks).
  const trackCountByFolder = new Map<number, number>()
  const directMissingByFolder = new Map<number, boolean>()
  for (const t of tracks) {
    if (t.folder_id == null) continue
    trackCountByFolder.set(t.folder_id, (trackCountByFolder.get(t.folder_id) ?? 0) + 1)
    if (t.missing_since) directMissingByFolder.set(t.folder_id, true)
  }
  const childrenByParent = new Map<number | null, FolderNode[]>()
  for (const f of folders) {
    const key = f.parent_folder_id
    if (!childrenByParent.has(key)) childrenByParent.set(key, [])
    childrenByParent.get(key)!.push(f)
  }
  const subtreeHasMissing = new Map<number, boolean>()
  const computeSubtreeMissing = (folder: FolderNode): boolean => {
    if (subtreeHasMissing.has(folder.id)) return subtreeHasMissing.get(folder.id)!
    const children = childrenByParent.get(folder.id) ?? []
    const result = !!directMissingByFolder.get(folder.id) || children.some(computeSubtreeMissing)
    subtreeHasMissing.set(folder.id, result)
    return result
  }
  folders.forEach(computeSubtreeMissing)

  const handleSelectFolder = (id: number): void => {
    setActiveFolder(activeFolderId === id ? null : id)
  }

  const handleDragOver = (e: DragOverEvent): void => {
    setActiveDropId(e.over ? String(e.over.id) : null)
  }

  const handleDragEnd = (e: DragEndEvent): void => {
    setActiveDropId(null)
    setActiveDragLabel(null)
    const { active, over } = e
    if (!over) return

    const drag = active.data.current as DragData
    const dropData = over.data.current as { folderId: number | null } | undefined
    if (!dropData) return

    if (drag.type === 'folder') {
      const targetId = dropData.folderId
      if (targetId === null || targetId === drag.id) return
      moveFolder(drag.id, targetId).catch((err) => {
        setFolderMoveError(err instanceof Error ? err.message : String(err))
        setTimeout(() => setFolderMoveError(null), 5000)
      })
      return
    }

    const targetFolderId = dropData.folderId
    if (drag.currentFolderId === (targetFolderId ?? undefined)) return

    // "Unassigned" isn't a real directory — dropping there is always a
    // logical-only reassignment, never a file move (mirrors targetFolderId===null).
    if (targetFolderId === null) {
      setTrackFolder(drag.id, null)
      return
    }

    // Known-identity move: this is CrateCloud initiating the move itself, so
    // there's no ambiguity to resolve — never routes through
    // library:rescanFolder's size/duration/partial_hash matching.
    const trackIds = selected.has(drag.id) && selected.size > 1 ? [...selected] : [drag.id]
    const draggedTracks = tracks.filter((t) => trackIds.includes(t.id))

    setMoving(true)
    window.api.folders.moveTracksToFolder(trackIds, targetFolderId).then(async (results) => {
      setMoving(false)
      const byId = new Map(draggedTracks.map((t) => [t.id, t]))
      setMoveResults(
        results.map((r) => ({
          track: byId.get(r.trackId) ?? ({ id: r.trackId, title: 'Unknown track' } as Track),
          success: r.success,
          newPath: r.newFilepath,
          error: r.error,
        }))
      )
      const undoable = results
        .filter((r) => r.success)
        .map((r) => ({ trackId: r.trackId, oldFilepath: r.oldFilepath, newFilepath: r.newFilepath, oldFolderId: r.oldFolderId ?? null }))
      setLastMoveBatch(undoable.length ? undoable : null)
      await useLibraryStore.getState().initFromDb()
    })
  }

  const handleUndo = (): void => {
    if (!lastMoveBatch) return
    setMoving(true)
    window.api.folders.undoMoveBatch(lastMoveBatch).then(async (results) => {
      setMoving(false)
      const byId = new Map(tracks.map((t) => [t.id, t]))
      setMoveResults(
        results.map((r) => ({
          track: byId.get(r.trackId) ?? ({ id: r.trackId, title: 'Unknown track' } as Track),
          success: r.success,
          newPath: r.newFilepath,
          error: r.error,
        }))
      )
      setLastMoveBatch(null)
      await useLibraryStore.getState().initFromDb()
    })
  }

  const handleNewFolder = async (): Promise<void> => {
    try {
      await createFolderOnDisk(null)
    } catch (err) {
      setFolderMoveError(err instanceof Error ? err.message : String(err))
      setTimeout(() => setFolderMoveError(null), 5000)
    }
  }

  const handleDragStart = (e: { active: { data: { current?: DragData } } }): void => {
    const drag = e.active.data.current
    if (!drag) return
    if (drag.type === 'folder') {
      const f = folders.find((x) => x.id === drag.id)
      setActiveDragLabel(f?.name ?? '')
    } else {
      const multi = selected.has(drag.id) && selected.size > 1
      const t = tracks.find((x) => x.id === drag.id)
      setActiveDragLabel(multi ? `${selected.size} tracks` : (t?.title ?? ''))
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="fhv-root">
        <div className="fhv-toolbar">
          <span className="fhv-heading">Folder Hierarchy</span>
          <span style={{ display: 'flex', gap: 8 }}>
            {lastMoveBatch && (
              <button className="fhv-new-btn" onClick={handleUndo} disabled={moving} title="Undo the last move">
                ↶ Undo move
              </button>
            )}
            <button
              className="fhv-new-btn"
              onClick={() => { void handleNewFolder() }}
              title="Choose or create a folder on disk"
            >
              + New Folder
            </button>
          </span>
        </div>

        {folderMoveError && (
          <div className="fhv-move-error">
            <span>{folderMoveError}</span>
            <button onClick={() => setFolderMoveError(null)} type="button">✕</button>
          </div>
        )}

        <div className="fhv-tree">
          {roots.length === 0 && unassigned.length === 0 && (
            <div className="fhv-empty">
              No folders yet. Import a folder to see its structure here, or click + New Folder.
            </div>
          )}

          {roots.map((root) => (
            <FolderSubtree
              key={root.id}
              folder={root}
              allFolders={folders}
              allTracks={tracks}
              depth={0}
              activeDropId={activeDropId}
              activeFolderId={activeFolderId}
              onSelectFolder={handleSelectFolder}
              trackCountByFolder={trackCountByFolder}
              subtreeHasMissing={subtreeHasMissing}
            />
          ))}

          {unassigned.length > 0 && <UnassignedDropZone tracks={unassigned} />}
        </div>
      </div>

      <DragOverlay>
        {activeDragLabel && (
          <div className="fhv-drag-ghost">{activeDragLabel}</div>
        )}
      </DragOverlay>

      {moveResults !== null && (
        <MoveProgressModal results={moveResults} onClose={() => setMoveResults(null)} />
      )}
    </DndContext>
  )
}
