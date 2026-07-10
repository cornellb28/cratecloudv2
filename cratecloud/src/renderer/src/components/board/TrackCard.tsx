import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Track, Board } from '../../types/track'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'
import { TrackEditorModal } from '../TrackEditorModal'

type Props = { track: Track; col: string; allBoards: Board[] }

export function TrackCard({ track, col, allBoards }: Props): React.JSX.Element {
  const { selected, toggleSelect, audioPort, moveTrack, resetTrackStatus } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const { openMenu } = useContextMenu()
  const isSelected = selected.has(track.id)

  const [modalOpen, setModalOpen] = useState(false)
  const [moveDdOpen, setMoveDdOpen] = useState(false)
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )

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
    if (modalOpen) return
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
        onClick={() => { if (!moveDdOpen) setModalOpen(true) }}
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
            <div className="track-title">{track.title}</div>
            <div className="track-artist">{track.artist || <span style={{ color: '#444' }}>—</span>}</div>
          </div>
          <div className="card-header-actions" onPointerDown={(e) => e.stopPropagation()}>
            {track.status_is_manual && (
              <span className="card-pin-badge" title="Manually pinned to this board">⚲</span>
            )}
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

        <div className="track-tags">
          <span className={`tag bpm${!track.bpm ? ' dim' : ''}`}>{track.bpm || 'BPM?'}</span>
          <span className={`tag key${!track.key ? ' dim' : ''}`}>{track.key || 'Key?'}</span>
          {track.genre && <span className="tag genre">{track.genre}</span>}
          {track.energy && <span className="tag energy">E{track.energy}</span>}
        </div>
      </div>

      {modalOpen && (
        <TrackEditorModal track={track} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
