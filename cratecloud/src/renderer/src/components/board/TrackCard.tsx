import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Track } from '../../types/track'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'
import { TrackEditorModal } from '../TrackEditorModal'

type Props = { track: Track; col: string }

export function TrackCard({ track, col }: Props): React.JSX.Element {
  const { selected, toggleSelect, audioPort } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const { openMenu } = useContextMenu()
  const isSelected = selected.has(track.id)

  const [modalOpen, setModalOpen] = useState(false)
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
    data: { track, col },
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
        onClick={() => setModalOpen(true)}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
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
          <div
            className={`track-check${isSelected ? ' checked' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); toggleSelect(track.id) }}
          >
            {isSelected && <span className="check-mark">✓</span>}
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
