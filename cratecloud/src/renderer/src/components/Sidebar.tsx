import { useState, useEffect, useRef } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useFolderStore, type FolderNode } from '../stores/useFolderStore'
import type { Crate } from '../types/track'
import { TagCloud } from './TagCloud'
import { BookmarksPanel } from './BookmarksPanel'

type CrateMenuState = { x: number; y: number; crate: Crate } | null

// ── Folder filter tree (sidebar) ─────────────────────────────────────────────
function SidebarFolderNode({
  folder,
  allFolders,
  activeFolderId,
  onSelect,
  depth,
}: {
  folder: FolderNode
  allFolders: FolderNode[]
  activeFolderId: number | null
  onSelect: (id: number) => void
  depth: number
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const children = allFolders.filter((f) => f.parent_folder_id === folder.id)
  const isActive = activeFolderId === folder.id

  return (
    <div>
      <div
        className={`sb-item${isActive ? ' active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(isActive ? -1 : folder.id)}
      >
        {children.length > 0 && (
          <span
            className="sb-folder-arrow"
            onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x) }}
          >
            {expanded ? '▾' : '▸'}
          </span>
        )}
        {children.length === 0 && <span className="sb-folder-arrow-placeholder" />}
        <span className="sb-item-name">{folder.name}</span>
      </div>
      {expanded && children.map((child) => (
        <SidebarFolderNode
          key={child.id}
          folder={child}
          allFolders={allFolders}
          activeFolderId={activeFolderId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const {
    crates, activeCrateId, setActiveCrate,
    activeFolderId, setActiveFolder,
    openCrateDialog, openCrateEditDialog,
    allTracks,
  } = useLibraryStore()
  const { folders } = useFolderStore()

  const [crateMenu, setCrateMenu] = useState<CrateMenuState>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const totalCount = allTracks().length

  useEffect(() => {
    if (!crateMenu) return
    const dismiss = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setCrateMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCrateMenu(null) }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', onKey)
    }
  }, [crateMenu])

  const handleCrateContextMenu = (e: React.MouseEvent, crate: Crate) => {
    e.preventDefault()
    e.stopPropagation()
    setCrateMenu({ x: e.clientX, y: e.clientY, crate })
  }

  return (
    <div className="sidebar">
      {/* All Tracks */}
      <div className="sb-section">Library</div>
      <div
        className={`sb-item${activeCrateId === null ? ' active' : ''}`}
        onClick={() => setActiveCrate(null)}
      >
        <div className="sb-dot" style={{ background: '#555' }} />
        All Tracks
        <span className="sb-count">{totalCount}</span>
      </div>

      {/* Crates */}
      <div className="sb-section-row">
        <span className="sb-section">Crates</span>
        <button
          className="sb-add-btn"
          onClick={() => openCrateDialog('create')}
          title="New crate"
        >
          +
        </button>
      </div>

      {crates.length === 0 && (
        <div className="sb-empty">No crates yet</div>
      )}

      {crates.map((c) => (
        <div
          key={c.id}
          className={`sb-item${activeCrateId === c.id ? ' active' : ''}`}
          onClick={() => setActiveCrate(c.id)}
          onContextMenu={(e) => handleCrateContextMenu(e, c)}
        >
          <div className="sb-dot" style={{ background: c.color }} />
          <span className="sb-item-name">{c.name}</span>
          <span className="sb-count">{c.trackIds.size}</span>
        </div>
      ))}

      {/* Folder filter tree */}
      {folders.length > 0 && (
        <>
          <div className="sb-section">Folders</div>
          {folders
            .filter((f) => f.parent_folder_id === null)
            .map((root) => (
              <SidebarFolderNode
                key={root.id}
                folder={root}
                allFolders={folders}
                activeFolderId={activeFolderId}
                onSelect={(id) => setActiveFolder(id === -1 ? null : id)}
                depth={0}
              />
            ))}
        </>
      )}

      {/* Tag cloud */}
      <TagCloud />

      {/* Bookmarks */}
      <BookmarksPanel />

      {/* Inline crate context menu */}
      {crateMenu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ left: crateMenu.x, top: crateMenu.y }}
        >
          <div
            className="ctx-item"
            onClick={() => { openCrateEditDialog(crateMenu.crate); setCrateMenu(null) }}
          >
            Edit crate…
          </div>
          <div
            className="ctx-item ctx-danger"
            onClick={() => {
              useLibraryStore.getState().deleteCrate(crateMenu.crate.id)
              setCrateMenu(null)
            }}
          >
            Delete crate
          </div>
        </div>
      )}
    </div>
  )
}
