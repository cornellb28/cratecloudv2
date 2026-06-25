const CRATES = [
  { name: 'All tracks', color: '#7f77dd', count: 247, active: true },
  { name: 'Peak hour', color: '#1d9e75', count: 42 },
  { name: 'Warm up', color: '#378add', count: 31 },
  { name: 'Afro House', color: '#d85a30', count: 58 },
  { name: 'Tech House', color: '#d4537e', count: 74 },
  { name: 'B-sides', color: '#ba7517', count: 22 },
]

const SMART = [
  { name: 'Untagged', count: 14 },
  { name: 'Recently added', count: null },
  { name: 'High energy', count: null },
]

const SETLISTS = ['Friday club set', 'Festival 2026']

export function Sidebar(): React.JSX.Element {
  return (
    <div className="sidebar">
      <div className="sb-section">Crates</div>
      {CRATES.map((c) => (
        <div key={c.name} className={`sb-item${c.active ? ' active' : ''}`}>
          <div className="sb-dot" style={{ background: c.color }} />
          {c.name}
          {c.count != null && <span className="sb-count">{c.count}</span>}
        </div>
      ))}

      <div className="sb-section">Smart</div>
      {SMART.map((s) => (
        <div key={s.name} className="sb-item">
          <div className="sb-dot" style={{ background: '#444' }} />
          {s.name}
          {s.count != null && <span className="sb-count">{s.count}</span>}
        </div>
      ))}

      <div className="sb-section">Setlists</div>
      {SETLISTS.map((s) => (
        <div key={s} className="sb-item">
          <div className="sb-dot" style={{ background: '#555' }} />
          {s}
        </div>
      ))}
    </div>
  )
}
