import { useEffect, useState, useRef } from 'react'
import { useSetlistStore } from '../../stores/useSetlistStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import type { Track } from '../../types/track'

function totalDuration(tracks: Track[]): string {
  let secs = 0
  for (const t of tracks) {
    if (!t.duration_str) continue
    const [m, s] = t.duration_str.split(':').map(Number)
    secs += (m || 0) * 60 + (s || 0)
  }
  if (!secs) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/* ── Track Picker Modal ───────────────────────────────────────────────── */
function TrackPicker({ setlistId, setlistTrackIds, onClose }: {
  setlistId: number
  setlistTrackIds: number[]
  onClose: () => void
}): React.JSX.Element {
  const { addTrack, removeTrack } = useSetlistStore()
  const { columns } = useLibraryStore()
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Set<number>>(new Set())

  const allTracks = Object.values(columns).flat()
  const q = search.toLowerCase()
  const filtered = q
    ? allTracks.filter((t) =>
        [
          t.title, t.artist, t.genre, t.bpm, t.key, t.energy,
          t.album, t.year, t.remixer, t.label, t.comment,
          t.composer, t.grouping, t.format, t.camelot, t.openkey,
        ].some((v) => v?.toLowerCase().includes(q))
      )
    : allTracks

  const toggle = async (track: Track) => {
    if (pending.has(track.id)) return
    setPending((p) => new Set(p).add(track.id))
    if (setlistTrackIds.includes(track.id)) {
      await removeTrack(setlistId, track.id)
    } else {
      await addTrack(setlistId, track.id)
    }
    setPending((p) => { const n = new Set(p); n.delete(track.id); return n })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ted-backdrop" onClick={onClose}>
      <div className="sl-picker" onClick={(e) => e.stopPropagation()}>
        <div className="sl-picker-header">
          <span className="sl-picker-title">Add Tracks</span>
          <button className="ted-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="sl-picker-search">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="#555" strokeWidth="1.5" />
            <line x1="11" y1="11" x2="14" y2="14" stroke="#555" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            placeholder="Search tracks, artists…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sl-picker-input"
          />
        </div>
        <div className="sl-picker-list">
          {filtered.map((track) => {
            const inSet = setlistTrackIds.includes(track.id)
            return (
              <div
                key={track.id}
                className={`sl-picker-row${inSet ? ' in-set' : ''}`}
                onClick={() => toggle(track)}
              >
                <div className={`sl-picker-check${inSet ? ' checked' : ''}`}>
                  {inSet && '✓'}
                </div>
                <div className="sl-picker-info">
                  <span className="sl-picker-title-text">{track.title}</span>
                  <span className="sl-picker-artist">{track.artist || '—'}</span>
                </div>
                <div className="sl-picker-tags">
                  {track.bpm && <span className="lib-tag bpm">{track.bpm}</span>}
                  {track.key && <span className="lib-tag key">{track.key}</span>}
                </div>
                <span className="sl-picker-dur">{track.duration_str || ''}</span>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="sl-picker-empty">No tracks match your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main SetlistView ─────────────────────────────────────────────────── */
export function SetlistView(): React.JSX.Element {
  const {
    setlists, activeId, init, setActiveId,
    createSetlist, renameSetlist, deleteSetlist,
    removeTrack, reorder, exportToSerato,
  } = useSetlistStore()
  const { columns } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying } = usePlayerStore()

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { init() }, [])
  useEffect(() => { if (renamingId !== null) renameRef.current?.focus() }, [renamingId])

  const allTracks = Object.values(columns).flat()
  const trackMap = new Map(allTracks.map((t) => [t.id, t]))

  const active = setlists.find((s) => s.id === activeId) ?? null
  const setlistTracks = (active?.trackIds ?? [])
    .map((id) => trackMap.get(id))
    .filter((t): t is Track => !!t)

  const dur = totalDuration(setlistTracks)

  const handleCreate = async () => {
    const name = newName.trim() || 'New Playlist'
    await createSetlist(name)
    setNewName('')
    setCreating(false)
  }

  const handleRename = async () => {
    if (renamingId === null) return
    const name = renameVal.trim()
    if (name) await renameSetlist(renamingId, name)
    setRenamingId(null)
  }

  const handleExport = async () => {
    if (!active) return
    setExportMsg('Exporting…')
    const result = await exportToSerato(active.id, active.name)
    if (!result.seratoDetected) {
      setExportMsg('Serato not found on this machine.')
    } else if (result.success) {
      setExportMsg(`Exported! Saved to Serato as "CrateCloud / ${active.name}"`)
    } else {
      setExportMsg(`Error: ${result.error}`)
    }
    setTimeout(() => setExportMsg(null), 5000)
  }

  // Drag-to-reorder within setlist
  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragEnter = (idx: number) => setDragOver(idx)
  const handleDrop = async () => {
    if (dragIdx === null || dragOver === null || dragIdx === dragOver || !active) return
    const ids = [...active.trackIds]
    const [moved] = ids.splice(dragIdx, 1)
    ids.splice(dragOver, 0, moved)
    await reorder(active.id, ids)
    setDragIdx(null)
    setDragOver(null)
  }

  return (
    <div className="setlist-container">
      {/* ── Left sidebar ── */}
      <div className="setlist-sidebar">
        <div className="sl-sidebar-head">
          <span>Playlists</span>
          <button
            className="sl-new-btn"
            onClick={() => setCreating(true)}
            title="New playlist"
          >
            +
          </button>
        </div>

        {creating && (
          <div className="sl-create-row">
            <input
              autoFocus
              className="sl-create-input"
              placeholder="Playlist name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            <button className="sl-create-ok" onClick={handleCreate} type="button">✓</button>
          </div>
        )}

        <div className="sl-list">
          {setlists.map((sl) => (
            <div
              key={sl.id}
              className={`sl-item${activeId === sl.id ? ' active' : ''}`}
              onClick={() => setActiveId(sl.id)}
              onDoubleClick={() => {
                setRenamingId(sl.id)
                setRenameVal(sl.name)
              }}
            >
              <span className="sl-item-icon">♫</span>
              <span className="sl-item-name">{sl.name}</span>
              <span className="sl-item-count">{sl.trackIds.length}</span>
            </div>
          ))}
          {setlists.length === 0 && !creating && (
            <div className="sl-empty-hint">Click + to create your first playlist</div>
          )}
        </div>
      </div>

      {/* ── Right main ── */}
      <div className="setlist-main">
        {!active ? (
          <div className="sl-no-selection">
            <div className="sl-no-selection-icon">♫</div>
            <div className="sl-no-selection-title">No playlist selected</div>
            <div className="sl-no-selection-sub">Create or select a playlist on the left</div>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="sl-detail-header">
              <div className="sl-detail-left">
                {renamingId === active.id ? (
                  <input
                    ref={renameRef}
                    className="sl-rename-input"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={handleRename}
                  />
                ) : (
                  <h2
                    className="sl-detail-name"
                    onDoubleClick={() => { setRenamingId(active.id); setRenameVal(active.name) }}
                    title="Double-click to rename"
                  >
                    {active.name}
                  </h2>
                )}
                <span className="sl-detail-meta">
                  {setlistTracks.length} track{setlistTracks.length !== 1 ? 's' : ''}
                  {dur && ` · ${dur}`}
                </span>
              </div>
              <div className="sl-detail-actions">
                <button
                  className="sl-action-btn"
                  onClick={() => setPickerOpen(true)}
                  title="Add tracks from your library"
                >
                  + Add Tracks
                </button>
                <button
                  className="sl-action-btn accent"
                  onClick={handleExport}
                  title="Export this playlist as a Serato sub-crate"
                >
                  ⟱ Serato
                </button>
                <button
                  className="sl-delete-btn"
                  onClick={() => deleteSetlist(active.id)}
                  title="Delete playlist"
                >
                  ✕
                </button>
              </div>
            </div>

            {exportMsg && (
              <div className={`sl-export-msg${exportMsg.startsWith('Error') ? ' error' : ''}`}>
                {exportMsg}
              </div>
            )}

            {/* Track list */}
            {setlistTracks.length === 0 ? (
              <div className="sl-tracks-empty">
                <div>No tracks yet.</div>
                <button className="sl-action-btn" style={{ marginTop: 12 }} onClick={() => setPickerOpen(true)}>
                  + Add Tracks
                </button>
              </div>
            ) : (
              <table className="lib-table">
                <thead>
                  <tr className="lib-header-row">
                    <th className="lib-th sl-th-drag" />
                    <th className="lib-th lib-th-num">#</th>
                    <th className="lib-th">Title</th>
                    <th className="lib-th">Artist</th>
                    <th className="lib-th lib-th-mono">BPM</th>
                    <th className="lib-th lib-th-mono">Key</th>
                    <th className="lib-th">Genre</th>
                    <th className="lib-th lib-th-mono">Energy</th>
                    <th className="lib-th lib-th-mono">Duration</th>
                    <th className="lib-th sl-th-remove" />
                  </tr>
                </thead>
                <tbody>
                  {setlistTracks.map((track, i) => {
                    const isCurrentlyPlaying = currentTrack?.id === track.id
                    return (
                      <tr
                        key={track.id}
                        className={[
                          'lib-track-row',
                          isCurrentlyPlaying ? 'lib-playing' : '',
                          dragOver === i ? 'sl-drag-over' : '',
                        ].filter(Boolean).join(' ')}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragEnter={() => handleDragEnter(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onDragEnd={() => { setDragIdx(null); setDragOver(null) }}
                        onDoubleClick={() => track.filepath && playTrack(track)}
                      >
                        <td className="lib-td sl-td-drag" title="Drag to reorder">⠿</td>
                        <td
                          className="lib-td lib-td-num"
                          onClick={() => track.filepath && playTrack(track)}
                          title="Play"
                        >
                          {isCurrentlyPlaying
                            ? <span className="lib-num-playing">{isPlaying ? '▶' : '⏸'}</span>
                            : <><span className="lib-num-idx">{i + 1}</span><span className="lib-num-play">▶</span></>
                          }
                        </td>
                        <td className="lib-td lib-td-title">{track.title}</td>
                        <td className="lib-td lib-td-artist">{track.artist || <span className="lib-dim">—</span>}</td>
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
                        <td className="lib-td sl-td-remove">
                          <button
                            className="sl-remove-btn"
                            onClick={() => removeTrack(active.id, track.id)}
                            title="Remove from playlist"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {pickerOpen && active && (
        <TrackPicker
          setlistId={active.id}
          setlistTrackIds={active.trackIds}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
