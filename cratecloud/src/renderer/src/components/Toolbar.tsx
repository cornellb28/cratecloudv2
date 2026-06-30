import { useLibraryStore } from '../stores/useLibraryStore'

const FILTERS = ['All', 'Untagged', '8A–8B', '128–132 BPM']
const VIEWS: { label: string; id: string }[] = [
  { label: '≡ List', id: 'List' },
  { label: '⊞ Board', id: 'Board' },
  { label: '⊟ Grid', id: 'Grid' },
]

export function Toolbar(): React.JSX.Element {
  const { searchQuery, setSearchQuery, activeFilter, setActiveFilter, activeView, setActiveView } =
    useLibraryStore()

  return (
    <div className="toolbar">
      <div className="search-wrap">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="#555" strokeWidth="1.5" />
          <line x1="11" y1="11" x2="14" y2="14" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          placeholder="Search tracks, artists, tags…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="filter-pills">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`pill${activeFilter === f ? ' on' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="view-btns">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`vbtn${activeView === v.id ? ' active' : ''}`}
            onClick={() => setActiveView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
