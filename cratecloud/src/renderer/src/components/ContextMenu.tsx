import { useEffect, useRef } from 'react'
import { useContextMenu } from '../contexts/ContextMenuContext'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'

const MENU_W = 200

// MOBILE TODO: Positioned dropdown does not work on touch.
// Replace with an action sheet anchored to the bottom:
// full-width, larger touch targets, swipe down to dismiss.
export function ContextMenu(): React.JSX.Element | null {
  const { menu, closeMenu } = useContextMenu()
  const {
    setActiveTrack, moveTrack, updateTrack, openDeleteDialog, openEditDialog,
    crates, activeCrateId, addTracksToCrate, removeTracksFromCrate, boards, resetTrackStatus,
    setRenamingTrackId, activeTab, selectedGenre, selectedArtist, setActiveTab,
    setSelectedGenre, setSelectedArtist,
  } = useLibraryStore()
  const { playTrack } = usePlayerStore()
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

  const isMissing = track.missing_since != null

  const handleRename = act(() => setRenamingTrackId(track.id))

  const handleLocateFile = async () => {
    closeMenu()
    const picked = await window.api.dialog.openFiles()
    if (!picked.length) return
    const result = await window.api.track.relinkFile(track.id, picked[0])
    if (result.ok && result.newPath) {
      updateTrack(track.id, { filepath: result.newPath, missing_since: null })
    } else {
      console.error('Locate file failed:', result.error)
    }
  }

  const handleReanalyze = async () => {
    closeMenu()
    if (!track.filepath) return
    try {
      const result = await window.api.analyzeFile(track.filepath, false)
      if (!result.success) { console.error('Re-analyze failed:', result.error); return }
      updateTrack(track.id, {
        bpm: result.bpm != null ? String(Math.round(result.bpm)) : track.bpm,
        key: result.camelot ?? track.key,
        camelot: result.camelot ?? track.camelot,
        openkey: result.openkey ?? track.openkey,
        energy: result.energy != null ? String(Math.min(10, Math.round(result.energy * 10))) : track.energy,
        genre: result.genre ?? track.genre,
        duration_sec: result.duration_sec ?? track.duration_sec,
        duration_str: result.duration_str ?? track.duration_str,
        waveform: result.waveform ?? track.waveform,
      })
    } catch (err) {
      console.error('Re-analyze failed:', err)
    }
  }

  const handleCopyFilepath = act(() => {
    if (track.filepath) navigator.clipboard.writeText(track.filepath)
  })

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: posX, top: posY }}
    >
      {track.filepath && (
        <div className="ctx-item ctx-play" onClick={act(() => playTrack(track))}>
          ▶ Play
        </div>
      )}
      {isMissing ? (
        <div className="ctx-item" onClick={handleLocateFile}>
          Locate file…
        </div>
      ) : (
        track.filepath && (
          <div className="ctx-item" onClick={handleRename}>
            Rename file
          </div>
        )
      )}
      <div className="ctx-item" onClick={act(() => setActiveTrack(track, col))}>
        Open in Inspector
      </div>
      <div className="ctx-item" onClick={act(() => openEditDialog(track, col))}>
        Edit tags…
      </div>
      {track.filepath && !isMissing && (
        <div className="ctx-item" onClick={handleReanalyze}>
          Re-analyze
        </div>
      )}

      <div className="ctx-sep" />
      {track.status_is_manual && (
        <div className="ctx-item ctx-reset" onClick={act(() => void resetTrackStatus(track.id))}>
          ↺ Reset to auto-board
        </div>
      )}
      <div className="ctx-label">Move to board</div>
      {boards.filter((b) => b.name !== col).map((b) => (
        <div key={b.id} className="ctx-item ctx-indent" onClick={() => handleMoveToCol(b.name)}>
          <span className="ctx-crate-dot" style={{ background: b.color }} />
          {b.name}
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
          <div
            className="ctx-item"
            onClick={act(() => window.api.fs.showInFolder(track.filepath!))}
          >
            {window.api.platform === 'win32' ? 'Show in Explorer' : 'Show in Finder'}
          </div>
          <div className="ctx-item" onClick={handleMoveFile}>
            Move file to folder…
          </div>
          <div className="ctx-item" onClick={handleCopyFilepath}>
            Copy filepath
          </div>
        </>
      )}

      {(track.artist || track.genre) && (
        <>
          <div className="ctx-sep" />
          {track.artist && !(activeTab === 'Library' && selectedArtist === track.artist) && (
            <div
              className="ctx-item"
              onClick={act(() => { setActiveTab('Library'); setSelectedArtist(track.artist!) })}
            >
              Go to artist
            </div>
          )}
          {track.genre && !(activeTab === 'Library' && selectedGenre === track.genre) && (
            <div
              className="ctx-item"
              onClick={act(() => { setActiveTab('Library'); setSelectedGenre(track.genre!) })}
            >
              Go to genre
            </div>
          )}
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
