import { useEffect, useRef } from 'react'
import { useContextMenu } from '../contexts/ContextMenuContext'
import { useLibraryStore } from '../stores/useLibraryStore'

const COLUMNS = ['Untagged', 'Tagged', 'Crate ready', 'Gig ready']
const MENU_W = 200

export function ContextMenu(): React.JSX.Element | null {
  const { menu, closeMenu } = useContextMenu()
  const {
    setActiveTrack, moveTrack, updateTrack, openDeleteDialog, openEditDialog,
    crates, activeCrateId, addTracksToCrate, removeTracksFromCrate,
  } = useLibraryStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu, closeMenu])

  if (!menu) return null

  const { x, y, track, col } = menu

  // Keep menu inside the viewport
  const posX = Math.min(x, window.innerWidth - MENU_W - 12)
  const posY = Math.min(y, window.innerHeight - 320)

  const act = (fn: () => void) => () => { fn(); closeMenu() }

  const handleMoveToCol = (targetCol: string) =>
    act(() => moveTrack(track.id, col, targetCol))()

  const handleMoveFile = async () => {
    if (!track.filepath) { closeMenu(); return }
    const folder = await window.api.dialog.openFolder()
    closeMenu()
    if (!folder) return
    try {
      const newPath = await window.api.fs.moveFile(track.filepath, folder)
      updateTrack(track.id, { filepath: newPath, folder: folder.split('/').pop() })
    } catch (err) {
      console.error('Move file failed:', err)
    }
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: posX, top: posY }}
    >
      <div className="ctx-item" onClick={act(() => setActiveTrack(track, col))}>
        Open in Inspector
      </div>
      <div className="ctx-item" onClick={act(() => openEditDialog(track, col))}>
        Edit tags…
      </div>

      <div className="ctx-sep" />
      <div className="ctx-label">Move to crate</div>
      {COLUMNS.filter((c) => c !== col).map((c) => (
        <div key={c} className="ctx-item ctx-indent" onClick={() => handleMoveToCol(c)}>
          <span className="ctx-arrow">›</span> {c}
        </div>
      ))}

      {crates.length > 0 && (
        <>
          <div className="ctx-sep" />
          <div className="ctx-label">Add to crate</div>
          {crates.map((c) => (
            <div
              key={c.id}
              className="ctx-item ctx-indent"
              onClick={act(() => addTracksToCrate(c.id, [track.id]))}
            >
              <span className="ctx-crate-dot" style={{ background: c.color }} />
              {c.name}
            </div>
          ))}
          {activeCrateId !== null && (
            <>
              <div className="ctx-sep" />
              <div
                className="ctx-item"
                onClick={act(() => removeTracksFromCrate(activeCrateId, [track.id]))}
              >
                Remove from crate
              </div>
            </>
          )}
        </>
      )}

      {track.filepath && (
        <>
          <div className="ctx-sep" />
          <div className="ctx-item" onClick={handleMoveFile}>
            Move file to folder…
          </div>
        </>
      )}

      <div className="ctx-sep" />
      <div
        className="ctx-item ctx-danger"
        onClick={act(() => openDeleteDialog(track.id))}
      >
        Remove / Delete…
      </div>
    </div>
  )
}
