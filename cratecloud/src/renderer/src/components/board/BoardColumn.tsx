import { useDroppable } from '@dnd-kit/core'
import type { Track } from '../../types/track'
import { COLUMN_COLORS } from '../../types/track'
import { TrackCard } from './TrackCard'

type Props = { name: string; tracks: Track[] }

export function BoardColumn({ name, tracks }: Props): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${name}`,
    data: { col: name },
  })

  const color = COLUMN_COLORS[name] ?? '#888'

  return (
    <div className="col">
      <div className="col-header">
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span className="col-title">{name}</span>
        <span className="col-count">{tracks.length}</span>
        <button className="col-add" title="Add track">+</button>
      </div>

      <div ref={setNodeRef} className="col-body">
        {tracks.map((t) => (
          <TrackCard key={t.id} track={t} col={name} />
        ))}
        <div className={`col-drop-zone${isOver ? ' over' : ''}`}>Drop here</div>
      </div>
    </div>
  )
}
