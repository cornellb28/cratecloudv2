import { DndContext, type DragEndEvent, pointerWithin } from '@dnd-kit/core'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { BoardColumn } from './BoardColumn'
import type { Track } from '../../types/track'

export function BoardView(): React.JSX.Element {
  const { columns, moveTrack } = useLibraryStore()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const dragData = active.data.current as { track: Track; col: string } | undefined
    const dropData = over.data.current as { col: string } | undefined

    if (dragData && dropData && dragData.col !== dropData.col) {
      moveTrack(dragData.track.id, dragData.col, dropData.col)
    }
  }

  return (
    <DndContext collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="board">
        {Object.entries(columns).map(([name, tracks]) => (
          <BoardColumn key={name} name={name} tracks={tracks} />
        ))}
      </div>
    </DndContext>
  )
}
