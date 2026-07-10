import { useState, useRef } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, pointerWithin,
  DragOverlay,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useFolderStore, type FolderNode } from '../stores/useFolderStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { Track } from '../types/track'

// ── Drag data types ──────────────────────────────────────────────────────────
type DragData =
  | { type: 'folder'; id: number }
  | { type: 'track'; id: number; currentFolderId: number | undefined }

// ── FolderRow: droppable + draggable folder node ──────────────────────────────
function FolderRow({
  folder,
  depth,
  expanded,
  onToggle,
  isOver,
}: {
  folder: FolderNode
  depth: number
  expanded: boolean
  onToggle: () => void
  isOver: boolean
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
  const renameInputRef = useRef<HTMLInputElement>(null)
  const { renameFolder, deleteFolder } = useFolderStore()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const commitRename = async () => {
    const trimmed = renameVal.trim()
    if (trimmed && trimmed !== folder.name) await renameFolder(folder.id, trimmed)
    setRenaming(false)
  }

  const setRef = (el: HTMLElement | null) => {
    setDragRef(el)
    setDropRef(el)
  }

  return (
    <>
      <div
        ref={setRef}
        className={`fhv-folder-row${isOver ? ' fhv-drop-over' : ''}${isDragging ? ' fhv-dragging' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={onToggle}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
        {...attributes}
        {...listeners}
      >
        <span className="fhv-folder-arrow">{expanded ? '▾' : '▸'}</span>
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
      </div>

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
function TrackRow({ track, depth }: { track: Track; depth: number }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { type: 'track', id: track.id, currentFolderId: track.folder_id } satisfies DragData,
  })

  return (
    <div
      ref={setNodeRef}
      className={`fhv-track-row${isDragging ? ' fhv-dragging' : ''}`}
      style={{ paddingLeft: 12 + depth * 16 }}
      {...attributes}
      {...listeners}
    >
      <span className="fhv-track-icon">♪</span>
      <span className="fhv-track-title">{track.title}</span>
      {track.artist && <span className="fhv-track-artist"> — {track.artist}</span>}
      {track.bpm && <span className="fhv-track-bpm">{track.bpm}</span>}
    </div>
  )
}

// ── UnassignedDropZone: tracks without a folder ───────────────────────────────
function UnassignedDropZone({ tracks }: { tracks: Track[] }): React.JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: 'folder-drop-unassigned',
    data: { folderId: null },
  })
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div
        ref={setNodeRef}
        className={`fhv-folder-row${isOver ? ' fhv-drop-over' : ''}`}
        style={{ paddingLeft: 12 }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="fhv-folder-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="fhv-folder-name fhv-folder-dim">Unassigned ({tracks.length})</span>
      </div>
      {expanded && tracks.map((t) => <TrackRow key={t.id} track={t} depth={1} />)}
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
}: {
  folder: FolderNode
  allFolders: FolderNode[]
  allTracks: Track[]
  depth: number
  activeDropId: string | null
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const isOver = activeDropId === `folder-drop-${folder.id}`
  const children = allFolders.filter((f) => f.parent_folder_id === folder.id)
  const tracks = allTracks.filter((t) => t.folder_id === folder.id)

  return (
    <div>
      <FolderRow
        folder={folder}
        depth={depth}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        isOver={isOver}
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
            />
          ))}
          {tracks.map((t) => <TrackRow key={t.id} track={t} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function FolderHierarchyView(): React.JSX.Element {
  const { folders, createFolder, moveFolder } = useFolderStore()
  const { allTracks, setTrackFolder } = useLibraryStore()
  const tracks = allTracks()

  const [activeDropId, setActiveDropId] = useState<string | null>(null)
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const roots = folders.filter((f) => f.parent_folder_id === null)
  const unassigned = tracks.filter((t) => t.folder_id == null)

  const handleDragOver = (e: DragOverEvent) => {
    setActiveDropId(e.over ? String(e.over.id) : null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
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
      moveFolder(drag.id, targetId)
    } else if (drag.type === 'track') {
      const targetFolderId = dropData.folderId ?? null
      if (drag.currentFolderId === (targetFolderId ?? undefined)) return
      setTrackFolder(drag.id, targetFolderId)
    }
  }

  const handleDragStart = (e: { active: { data: { current?: DragData } } }) => {
    const drag = e.active.data.current
    if (!drag) return
    if (drag.type === 'folder') {
      const f = folders.find((x) => x.id === drag.id)
      setActiveDragLabel(f?.name ?? '')
    } else {
      const t = tracks.find((x) => x.id === drag.id)
      setActiveDragLabel(t?.title ?? '')
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
          <button
            className="fhv-new-btn"
            onClick={() => createFolder('New Folder', null)}
            title="Create a new top-level folder"
          >
            + New Folder
          </button>
        </div>

        <div className="fhv-tree">
          {roots.length === 0 && unassigned.length === 0 && (
            <div className="fhv-empty">
              No folders yet. Import a folder to see its structure here, or click "+ New Folder".
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
    </DndContext>
  )
}
