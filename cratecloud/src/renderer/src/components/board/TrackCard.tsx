import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Track } from '../../types/track'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'

type Props = { track: Track; col: string }

export function TrackCard({ track, col }: Props): React.JSX.Element {
  const { selected, toggleSelect, setActiveTrack, activeTrack } = useLibraryStore()
  const { openMenu } = useContextMenu()
  const isSelected = selected.has(track.id)
  const isInspected = activeTrack?.id === track.id

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { track, col },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openMenu(e.clientX, e.clientY, track, col)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        'track-card',
        isSelected || isInspected ? 'selected' : '',
        isDragging ? 'dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setActiveTrack(track, col)}
      onContextMenu={handleContextMenu}
    >
      <div className="track-top">
        <div
          className={`track-check${isSelected ? ' checked' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            toggleSelect(track.id)
          }}
        >
          {isSelected && <span className="check-mark">✓</span>}
        </div>
        <div className="track-info">
          <div className="track-title">{track.title}</div>
          <div className="track-artist">{track.artist}</div>
        </div>
      </div>

      <div className="track-tags">
        <span className={`tag bpm${!track.bpm ? ' dim' : ''}`}>{track.bpm || 'BPM?'}</span>
        <span className={`tag key${!track.key ? ' dim' : ''}`}>{track.key || 'Key?'}</span>
        {track.genre && <span className="tag genre">{track.genre}</span>}
        {track.energy && <span className="tag energy">E{track.energy}</span>}
      </div>
    </div>
  )
}
