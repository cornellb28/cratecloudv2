import { useLibraryStore } from '../stores/useLibraryStore'

export function BulkBar(): React.JSX.Element | null {
  const { selected, clearSelection, bulkMove } = useLibraryStore()

  if (selected.size === 0) return null

  return (
    <div className="bulk-bar">
      <span>{selected.size} track{selected.size !== 1 ? 's' : ''} selected</span>
      <button className="bulk-btn" onClick={() => bulkMove('Crate ready')}>→ Crate ready</button>
      <button className="bulk-btn" onClick={() => bulkMove('Gig ready')}>→ Gig ready</button>
      <button className="bulk-btn">✦ AI tag all</button>
      <button className="bulk-btn danger" onClick={clearSelection}>✕ Deselect</button>
    </div>
  )
}
