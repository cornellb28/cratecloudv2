import { useState, useEffect, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Track, Board } from '../../types/track'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'
import { TrackEditorModal } from '../TrackEditorModal'
import { CratePicker } from '../CratePicker'

type Props = { track: Track; col: string; allBoards: Board[] }

export function TrackCard({ track, col, allBoards }: Props): React.JSX.Element {
  const {
    selected, toggleSelect, audioPort, moveTrack, resetTrackStatus, updateTrack,
    renamingTrackId, setRenamingTrackId,
  } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const { openMenu } = useContextMenu()
  const isSelected = selected.has(track.id)
  const isMissing = track.missing_since != null
  const isRenaming = renamingTrackId === track.id

  const [modalOpen, setModalOpen] = useState(false)
  const [moveDdOpen, setMoveDdOpen] = useState(false)
  const [cratePickerOpen, setCratePickerOpen] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState(track.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const crateBtnRef = useRef<HTMLButtonElement>(null)
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(track.title)
      setRenameError(null)
    }
  }, [isRenaming, track.title])

  const commitRename = async (): Promise<void> => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenameError('Name cannot be empty'); return }
    if (/[/\\]/.test(trimmed)) { setRenameError('Name cannot contain slashes'); return }
    if (trimmed === track.title) { setRenamingTrackId(null); return }
    const result = await window.api.track.renameFile(track.id, trimmed)
    if (result.ok) {
      updateTrack(track.id, { filepath: result.newPath, title: result.newTitle })
      setRenamingTrackId(null)
    } else {
      setRenameError(result.error ?? 'Rename failed')
    }
  }

  const cancelRename = (): void => {
    setRenamingTrackId(null)
    setRenameError(null)
  }

  const handleMoveToFolder = async (): Promise<void> => {
    if (!track.filepath) return
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    try {
      const newPath = await window.api.fs.moveFile(track.filepath, folder)
      updateTrack(track.id, { filepath: newPath, folder: folder.split('/').pop() })
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : String(err))
      setTimeout(() => setMoveError(null), 3000)
    }
  }

  useEffect(() => {
    if (track.artwork_path && audioPort) {
      setArtworkSrc(`http://127.0.0.1:${audioPort}${track.artwork_path}`)
    }
  }, [track.artwork_path, audioPort])

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { type: 'track', track, col },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (modalOpen || isRenaming) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setModalOpen(true)
    }
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      if (currentTrack?.id === track.id) togglePlayPause()
      else if (track.filepath) playTrack(track)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openMenu(e.clientX, e.clientY, track, col)
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={[
          'track-card',
          isSelected ? 'selected' : '',
          isDragging ? 'dragging' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => { if (!moveDdOpen && !isRenaming) setModalOpen(true) }}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onBlur={() => setMoveDdOpen(false)}
      >
        <div className="card-header">
          {artworkSrc ? (
            <img
              className="card-art-thumb"
              src={artworkSrc}
              onError={() => setArtworkSrc(undefined)}
              draggable={false}
            />
          ) : (
            <div className="card-art-placeholder">♪</div>
          )}
          <div className="card-header-info">
            {isRenaming ? (
              <div
                className="card-rename-wrap"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  className="card-rename-input"
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
                <div className={`card-rename-hint${renameError ? ' error' : ''}`}>
                  {renameError ?? 'Enter to save · Esc to cancel'}
                </div>
              </div>
            ) : (
              <>
                <div className="track-title">{track.title}</div>
                <div className="track-artist">{track.artist || <span style={{ color: 'var(--color-text-disabled)' }}>—</span>}</div>
                {moveError && <div className="card-move-error">{moveError}</div>}
              </>
            )}
          </div>
          <div className="card-header-actions" onPointerDown={(e) => e.stopPropagation()}>
            {track.status_is_manual && (
              <span className="card-pin-badge" title="Manually pinned to this board">⚲</span>
            )}
            <button
              className="card-move-btn"
              onClick={handleContextMenu}
              title="More actions"
            >
              ⋯
            </button>
            <div className="card-move-wrap">
              <button
                className="card-move-btn"
                onClick={(e) => { e.stopPropagation(); setMoveDdOpen((o) => !o) }}
                title="Move to board"
              >
                ↗
              </button>
              {moveDdOpen && (
                <div className="card-move-dd" onClick={(e) => e.stopPropagation()}>
                  {track.status_is_manual && (
                    <>
                      <div
                        className="card-move-item card-move-reset"
                        onClick={() => { void resetTrackStatus(track.id); setMoveDdOpen(false) }}
                      >
                        ↺ Reset to auto
                      </div>
                      <div className="card-move-sep" />
                    </>
                  )}
                  {allBoards.filter((b) => b.name !== col).map((b) => (
                    <div
                      key={b.id}
                      className="card-move-item"
                      onClick={() => { moveTrack(track.id, col, b.name); setMoveDdOpen(false) }}
                    >
                      <span className="card-move-dot" style={{ background: b.color }} />
                      {b.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div
              className={`track-check${isSelected ? ' checked' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleSelect(track.id) }}
            >
              {isSelected && <span className="check-mark">✓</span>}
            </div>
          </div>
        </div>

        <div className="track-tags-wrap">
          <div className="track-tags">
            <span className={`tag bpm${!track.bpm ? ' dim' : ''}`}>{track.bpm || 'BPM?'}</span>
            <span className={`tag key${!track.key ? ' dim' : ''}`}>{track.key || 'Key?'}</span>
            {track.genre && <span className="tag genre">{track.genre}</span>}
            {track.energy && <span className="tag energy">E{track.energy}</span>}
            {isMissing && <span className="tag missing">Missing</span>}
          </div>

          {!isRenaming && (
            <div
              className="card-hover-actions"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={[
                  'chab', 'chab-play',
                  currentTrack?.id === track.id && isPlaying ? 'playing' : '',
                  currentTrack?.id === track.id && !isPlaying ? 'paused' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (currentTrack?.id === track.id) togglePlayPause()
                  else playTrack(track)
                }}
                disabled={isMissing || !track.filepath}
                title={isMissing ? 'File missing on disk' : (currentTrack?.id === track.id && isPlaying ? 'Pause' : 'Play')}
              >
                {currentTrack?.id === track.id && isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className="chab"
                onClick={() => setRenamingTrackId(track.id)}
                disabled={!track.filepath}
                title="Rename file"
              >
                ✎
              </button>
              <button
                className="chab"
                onClick={() => void handleMoveToFolder()}
                disabled={!track.filepath}
                title="Move to folder"
              >
                📁
              </button>
              <button
                ref={crateBtnRef}
                className="chab"
                onClick={() => setCratePickerOpen((o) => !o)}
                title="Add to crate"
              >
                +
              </button>
            </div>
          )}

          {cratePickerOpen && (
            <CratePicker
              trackId={track.id}
              anchorRef={crateBtnRef}
              onClose={() => setCratePickerOpen(false)}
            />
          )}
        </div>
      </div>

      {modalOpen && (
        <TrackEditorModal track={track} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
