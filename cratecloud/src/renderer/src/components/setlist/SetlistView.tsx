import { useLibraryStore } from '../../stores/useLibraryStore'

function formatDate(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`
}

function totalDuration(durations: (string | undefined)[]): string {
  let total = 0
  for (const d of durations) {
    if (!d) continue
    const [m, s] = d.split(':').map(Number)
    total += (m || 0) * 60 + (s || 0)
  }
  if (!total) return ''
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function SetlistView(): React.JSX.Element {
  const { setlists, selectedSetlistId, setSelectedSetlist, allTracks, setActiveTrack, activeTrack } =
    useLibraryStore()

  const tracks = allTracks()
  const trackMap = new Map(tracks.map((t) => [t.id, t]))

  // Group setlists by group name
  const groups = [...new Set(setlists.map((s) => s.group))]

  const active = setlists.find((s) => s.id === selectedSetlistId) ?? null
  const setlistTracks = active ? active.trackIds.map((id) => trackMap.get(id)).filter(Boolean) : []

  const dur = totalDuration(setlistTracks.map((t) => t?.duration_str))

  return (
    <div className="setlist-container">
      {/* ── Left: group / setlist tree ── */}
      <div className="setlist-sidebar">
        <div className="setlist-sidebar-header">Setlists</div>
        {groups.map((group) => (
          <div key={group} className="setlist-group">
            <div className="setlist-group-label">{group}</div>
            {setlists
              .filter((s) => s.group === group)
              .map((s) => (
                <div
                  key={s.id}
                  className={`setlist-item${selectedSetlistId === s.id ? ' active' : ''}`}
                  onClick={() => setSelectedSetlist(s.id)}
                >
                  <span className="setlist-item-name">{s.name}</span>
                  <span className="setlist-item-count">{s.trackIds.length}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* ── Right: setlist detail ── */}
      <div className="setlist-main">
        {!active ? (
          <div className="setlist-empty">Select a setlist to view its tracks.</div>
        ) : (
          <>
            <div className="setlist-detail-header">
              <div className="setlist-detail-name">{active.name}</div>
              <div className="setlist-detail-meta">
                <span>{active.group}</span>
                {active.venue && <span>· {active.venue}</span>}
                {active.date && <span>· {formatDate(active.date)}</span>}
                {dur && <span>· {dur} total</span>}
              </div>
            </div>

            <table className="lib-table">
              <thead>
                <tr className="lib-header-row">
                  <th className="lib-th lib-th-num">#</th>
                  <th className="lib-th">Title</th>
                  <th className="lib-th">Artist</th>
                  <th className="lib-th lib-th-mono">BPM</th>
                  <th className="lib-th lib-th-mono">Key</th>
                  <th className="lib-th">Genre</th>
                  <th className="lib-th lib-th-mono">Energy</th>
                  <th className="lib-th lib-th-mono">Duration</th>
                </tr>
              </thead>
              <tbody>
                {setlistTracks.map((track, i) => (
                  track && (
                    <tr
                      key={track.id}
                      className={`lib-track-row${activeTrack?.id === track.id ? ' active' : ''}`}
                      onClick={() => setActiveTrack(track, active.name)}
                    >
                      <td className="lib-td lib-td-num">{i + 1}</td>
                      <td className="lib-td lib-td-title">{track.title}</td>
                      <td className="lib-td lib-td-artist">{track.artist || '—'}</td>
                      <td className="lib-td lib-td-mono">
                        {track.bpm ? <span className="lib-tag bpm">{track.bpm}</span> : <span className="lib-dim">—</span>}
                      </td>
                      <td className="lib-td lib-td-mono">
                        {track.key ? <span className="lib-tag key">{track.key}</span> : <span className="lib-dim">—</span>}
                      </td>
                      <td className="lib-td">{track.genre || <span className="lib-dim">—</span>}</td>
                      <td className="lib-td lib-td-mono">
                        {track.energy ? <span className="lib-tag energy">E{track.energy}</span> : <span className="lib-dim">—</span>}
                      </td>
                      <td className="lib-td lib-td-mono">{track.duration_str || <span className="lib-dim">—</span>}</td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
