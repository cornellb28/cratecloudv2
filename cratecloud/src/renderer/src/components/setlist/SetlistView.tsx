import { useEffect, useState, useRef } from 'react'
import { useSetlistStore } from '../../stores/useSetlistStore'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTrackCardActions } from '../../hooks/useTrackCardActions'
import { TrackEditorModal } from '../TrackEditorModal'
import { InlineGenreEditor } from '../InlineGenreEditor'
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
            <circle cx="7" cy="7" r="5" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
            <line x1="11" y1="11" x2="14" y2="14" stroke="var(--color-text-disabled)" strokeWidth="1.5" strokeLinecap="round" />
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

/* ── Setlist Bulk Edit Modal ──────────────────────────────────────────── */
function SetlistBulkEditModal({ tracks, onClose }: {
  tracks: Track[]
  onClose: () => void
}): React.JSX.Element {
  const { updateTrack } = useLibraryStore()
  const single = tracks.length === 1 ? tracks[0] : null

  const sharedVal = (key: keyof Track) => {
    const vals = [...new Set(tracks.map((t) => (t[key] as string) ?? ''))]
    return vals.length === 1 ? vals[0] : ''
  }

  const [artist, setArtist] = useState(single?.artist ?? sharedVal('artist'))
  const [bpm, setBpm] = useState(single?.bpm ?? sharedVal('bpm'))
  const [key, setKey] = useState(single?.key ?? sharedVal('key'))
  const [genre, setGenre] = useState(single?.genre ?? sharedVal('genre'))
  const [energy, setEnergy] = useState(single?.energy ?? sharedVal('energy'))
  const [year, setYear] = useState(single?.year ?? sharedVal('year'))

  const handleSave = () => {
    for (const track of tracks) {
      const updates: Partial<Track> = {}
      if (single) {
        // Single: save all fields (allow clearing)
        updates.artist = artist
        updates.bpm = bpm
        updates.key = key
        updates.genre = genre
        updates.energy = energy
        updates.year = year
      } else {
        // Multi: only apply non-empty fields
        if (artist) updates.artist = artist
        if (bpm) updates.bpm = bpm
        if (key) updates.key = key
        if (genre) updates.genre = genre
        if (energy) updates.energy = energy
        if (year) updates.year = year
      }
      if (Object.keys(updates).length) updateTrack(track.id, updates)
    }
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) handleSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [artist, bpm, key, genre, energy, year])

  return (
    <div className="ted-backdrop" onClick={onClose}>
      <div className="sl-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-edit-modal-header">
          <div className="sl-edit-modal-title">
            {single ? `Edit "${single.title}"` : `Edit ${tracks.length} tracks`}
          </div>
          <button className="ted-close" onClick={onClose}>✕</button>
        </div>

        {!single && (
          <div className="sl-edit-track-list">
            {tracks.map((t) => (
              <div key={t.id} className="sl-edit-track-row">
                <span className="sl-edit-track-title">{t.title}</span>
                <span className="sl-edit-track-artist">{t.artist || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {!single && (
          <div className="sl-edit-hint">Leave a field blank to keep each track's existing value.</div>
        )}

        <div className="sl-edit-fields">
          <div className="ca-field">
            <div className="ca-label">Artist</div>
            <input className="ca-input" value={artist} placeholder={single ? '' : '(multiple)'}
              onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div className="ca-row">
            <div className="ca-field">
              <div className="ca-label">BPM</div>
              <input className="ca-input" value={bpm} placeholder={single ? '' : '(multiple)'}
                onChange={(e) => setBpm(e.target.value)} />
            </div>
            <div className="ca-field">
              <div className="ca-label">Key</div>
              <input className="ca-input" value={key} placeholder={single ? '' : '(multiple)'}
                onChange={(e) => setKey(e.target.value)} />
            </div>
          </div>
          <div className="ca-row">
            <div className="ca-field">
              <div className="ca-label">Genre</div>
              <input className="ca-input" value={genre} placeholder={single ? '' : '(multiple)'}
                onChange={(e) => setGenre(e.target.value)} />
            </div>
            <div className="ca-field">
              <div className="ca-label">Energy (1–10)</div>
              <input className="ca-input" value={energy} placeholder={single ? '' : '(multiple)'}
                onChange={(e) => setEnergy(e.target.value)} />
            </div>
          </div>
          <div className="ca-field">
            <div className="ca-label">Year</div>
            <input className="ca-input" value={year} placeholder={single ? '' : '(multiple)'}
              onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>

        <div className="sl-edit-modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-solid" onClick={handleSave}>
            {single ? 'Save' : `Apply to ${tracks.length} tracks`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Grid card ────────────────────────────────────────────────────────── */
// Missing-file state, right-click context menu, and inline genre edit come
// from useTrackCardActions (see Section 3) — the same shared logic
// TrackCard and FolderHierarchyView's TrackRow use. Reordering/selection/
// remove-from-playlist stay local to this view (playlist-scoped, distinct
// from the library-wide selection every other track surface shares).
function SetlistGridCard({ track, index, selected, onToggleSelect, onPlay, isPlaying, onRemove, onEdit }: {
  track: Track
  index: number
  selected: boolean
  onToggleSelect: () => void
  onPlay: () => void
  isPlaying: boolean
  onRemove: () => void
  onEdit: () => void
}): React.JSX.Element {
  const { audioPort } = useLibraryStore()
  const { isMissing, genreEditorOpen, setGenreEditorOpen, genreError, handleGenreSelect, handleContextMenu } =
    useTrackCardActions(track)
  const [artSrc, setArtSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )

  return (
    <div
      className={`sl-grid-card${selected ? ' selected' : ''}`}
      onClick={onEdit}
      onContextMenu={handleContextMenu}
    >
      <div className="sl-grid-card-top">
        <button
          className={`sl-grid-play${isPlaying ? ' playing' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (!isMissing) onPlay() }}
          disabled={isMissing}
          title={isMissing ? 'File not found on disk' : (isPlaying ? 'Playing' : 'Play')}
        >
          {isPlaying ? '▶' : index + 1}
        </button>
        <label className="sl-grid-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          <span className="sl-grid-check-box" />
        </label>
      </div>
      <div className="sl-grid-art-wrap">
        {artSrc ? (
          <img
            className="sl-grid-art"
            src={artSrc}
            onError={() => setArtSrc(undefined)}
            draggable={false}
          />
        ) : (
          <div className="sl-grid-art-placeholder">♪</div>
        )}
        {isMissing && <div className="lib-grid-missing-dot" title="File not found on disk" />}
      </div>
      <div className="sl-grid-info">
        <div className="sl-grid-title" title={track.title}>{track.title}</div>
        <div className="sl-grid-artist">{track.artist || <span className="lib-dim">—</span>}</div>
      </div>
      <div className="sl-grid-tags">
        {track.bpm && <span className="lib-tag bpm">{track.bpm}</span>}
        {track.key && <span className="lib-tag key">{track.key}</span>}
        {track.energy && <span className="lib-tag energy">E{track.energy}</span>}
        <span
          className={`tag genre ige-trigger${!track.genre ? ' dim' : ''}`}
          onClick={(e) => { e.stopPropagation(); setGenreEditorOpen(true) }}
        >
          {track.genre || 'Genre?'} <span className="ige-chevron">▾</span>
          {genreEditorOpen && (
            <InlineGenreEditor
              value={track.genre}
              onSelect={(v) => void handleGenreSelect(v)}
              onClose={() => setGenreEditorOpen(false)}
            />
          )}
        </span>
      </div>
      {genreError && <div className="fhv-rename-error">{genreError}</div>}
      <button className="sl-grid-remove" onClick={(e) => { e.stopPropagation(); onRemove() }} title="Remove from playlist">✕</button>
    </div>
  )
}

/* ── List row ─────────────────────────────────────────────────────────── */
// Extracted so useTrackCardActions can be called once per row (hooks can't
// be called inside the .map() callback this used to live in directly).
function SetlistTrackRow({
  track, index, isCurrentlyPlaying, isPlaying, isChecked, isDragOver, onToggleSelect,
  onPlay, onRemove, onEdit, onDragStart, onDragEnter, onDrop, onDragEnd,
}: {
  track: Track
  index: number
  isCurrentlyPlaying: boolean
  isPlaying: boolean
  isChecked: boolean
  isDragOver: boolean
  onToggleSelect: () => void
  onPlay: () => void
  onRemove: () => void
  onEdit: () => void
  onDragStart: () => void
  onDragEnter: () => void
  onDrop: () => void
  onDragEnd: () => void
}): React.JSX.Element {
  const { isMissing, genreEditorOpen, setGenreEditorOpen, genreError, handleGenreSelect, handleContextMenu } =
    useTrackCardActions(track)

  return (
    <tr
      className={[
        'lib-track-row',
        isCurrentlyPlaying ? 'lib-playing' : '',
        isChecked ? 'sl-row-selected' : '',
        isDragOver ? 'sl-drag-over' : '',
      ].filter(Boolean).join(' ')}
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      onContextMenu={handleContextMenu}
    >
      <td className="lib-td sl-td-drag" title="Drag to reorder">⠿</td>
      <td className="lib-td sl-td-check" onClick={(e) => e.stopPropagation()}>
        <label className="sl-check-label">
          <input type="checkbox" checked={isChecked} onChange={onToggleSelect} />
          <span className="sl-check-box" />
        </label>
      </td>
      <td
        className="lib-td lib-td-num"
        onClick={(e) => { e.stopPropagation(); if (!isMissing) onPlay() }}
        title={isMissing ? 'File not found on disk' : (isCurrentlyPlaying ? (isPlaying ? 'Pause' : 'Resume') : 'Play')}
        style={isMissing ? { cursor: 'default' } : undefined}
      >
        {isCurrentlyPlaying
          ? <span className="lib-num-playing">{isPlaying ? '⏸' : '▶'}</span>
          : <><span className="lib-num-idx">{index + 1}</span><span className="lib-num-play" style={isMissing ? { opacity: 0.3 } : undefined}>▶</span></>
        }
      </td>
      <td className="lib-td lib-td-title">
        {track.title}
        {isMissing && (
          <span className="tag missing" style={{ marginLeft: 6 }} title="File not found on disk">⚠ Missing</span>
        )}
      </td>
      <td className="lib-td lib-td-artist">{track.artist || <span className="lib-dim">—</span>}</td>
      <td className="lib-td lib-td-mono">
        {track.bpm ? <span className="lib-tag bpm">{track.bpm}</span> : <span className="lib-dim">—</span>}
      </td>
      <td className="lib-td lib-td-mono">
        {track.key ? <span className="lib-tag key">{track.key}</span> : <span className="lib-dim">—</span>}
      </td>
      <td className="lib-td">
        <span
          className={`tag genre ige-trigger${!track.genre ? ' dim' : ''}`}
          onClick={(e) => { e.stopPropagation(); setGenreEditorOpen(true) }}
        >
          {track.genre || '—'} <span className="ige-chevron">▾</span>
          {genreEditorOpen && (
            <InlineGenreEditor
              value={track.genre}
              onSelect={(v) => void handleGenreSelect(v)}
              onClose={() => setGenreEditorOpen(false)}
            />
          )}
        </span>
        {genreError && <div className="fhv-rename-error">{genreError}</div>}
      </td>
      <td className="lib-td lib-td-mono">
        {track.energy ? <span className="lib-tag energy">E{track.energy}</span> : <span className="lib-dim">—</span>}
      </td>
      <td className="lib-td lib-td-mono">{track.duration_str || <span className="lib-dim">—</span>}</td>
      <td className="lib-td sl-td-remove">
        <button
          className="sl-remove-btn"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="Remove from playlist"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

/* ── Main SetlistView ─────────────────────────────────────────────────── */
export function SetlistView(): React.JSX.Element {
  const {
    setlists, activeId, init, setActiveId,
    createSetlist, renameSetlist, deleteSetlist,
    removeTrack, reorder, exportToSerato,
  } = useSetlistStore()
  const { columns, setActiveTrack } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editModalTracks, setEditModalTracks] = useState<Track[] | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { init() }, [])
  useEffect(() => { if (renamingId !== null) renameRef.current?.focus() }, [renamingId])
  // Clear selection when switching playlists
  useEffect(() => { setSelectedIds(new Set()) }, [activeId])

  const allTracks = Object.values(columns).flat()
  const trackMap = new Map(allTracks.map((t) => [t.id, t]))

  const active = setlists.find((s) => s.id === activeId) ?? null
  const setlistTracks = (active?.trackIds ?? [])
    .map((id) => trackMap.get(id))
    .filter((t): t is Track => !!t)

  const dur = totalDuration(setlistTracks)
  const selectedTracks = setlistTracks.filter((t) => selectedIds.has(t.id))
  const allSelected = setlistTracks.length > 0 && selectedTracks.length === setlistTracks.length

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(setlistTracks.map((t) => t.id)))
    }
  }

  const openEditModal = () => {
    if (selectedTracks.length === 0) return
    setEditModalTracks(selectedTracks)
  }

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

  const handlePlay = (track: Track) => {
    if (currentTrack?.id === track.id) togglePlayPause()
    else if (track.filepath) playTrack(track)
  }

  return (
    <div className="setlist-container">
      {/* ── Left sidebar ── */}
      <div className="setlist-sidebar">
        <div className="sl-sidebar-head">
          <span>Playlists</span>
          <button className="sl-new-btn" onClick={() => setCreating(true)} title="New playlist">+</button>
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
                if (e.key === 'Enter') { void handleCreate() }
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            <button className="sl-create-ok" onClick={() => { void handleCreate() }} type="button">✓</button>
          </div>
        )}

        <div className="sl-list">
          {setlists.map((sl) => (
            <div
              key={sl.id}
              className={`sl-item${activeId === sl.id ? ' active' : ''}`}
              onClick={() => setActiveId(sl.id)}
              onDoubleClick={() => { setRenamingId(sl.id); setRenameVal(sl.name) }}
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
                      if (e.key === 'Enter') { void handleRename() }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => { void handleRename() }}
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
                {selectedIds.size > 0 && (
                  <button className="btn btn-outline" onClick={openEditModal}>
                    ✎ Edit {selectedIds.size}
                  </button>
                )}
                {/* View toggle */}
                <div className="sl-view-toggle">
                  <button
                    className={`sl-view-btn${viewMode === 'list' ? ' active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="List view"
                  >
                    ≡
                  </button>
                  <button
                    className={`sl-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                  >
                    ⊞
                  </button>
                </div>
                <button className="btn btn-outline" onClick={() => setPickerOpen(true)} title="Add tracks from your library">
                  + Add Tracks
                </button>
                <button className="btn btn-solid" onClick={() => { void handleExport() }} title="Export as Serato sub-crate">
                  ⟱ Serato
                </button>
                <button className="sl-delete-btn" onClick={() => { void deleteSetlist(active.id) }} title="Delete playlist">
                  ✕
                </button>
              </div>
            </div>

            {exportMsg && (
              <div className={`sl-export-msg${exportMsg.startsWith('Error') ? ' error' : ''}`}>
                {exportMsg}
              </div>
            )}

            {/* Track content */}
            {setlistTracks.length === 0 ? (
              <div className="sl-tracks-empty">
                <div>No tracks yet.</div>
                <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setPickerOpen(true)}>
                  + Add Tracks
                </button>
              </div>
            ) : viewMode === 'list' ? (
              <table className="lib-table">
                <thead>
                  <tr className="lib-header-row">
                    <th className="lib-th sl-th-drag" />
                    <th className="lib-th sl-th-check">
                      <label className="sl-check-label">
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                        <span className="sl-check-box" />
                      </label>
                    </th>
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
                  {setlistTracks.map((track, i) => (
                    <SetlistTrackRow
                      key={track.id}
                      track={track}
                      index={i}
                      isCurrentlyPlaying={currentTrack?.id === track.id}
                      isPlaying={isPlaying}
                      isChecked={selectedIds.has(track.id)}
                      isDragOver={dragOver === i}
                      onToggleSelect={() => toggleSelect(track.id)}
                      onPlay={() => handlePlay(track)}
                      onRemove={() => { void removeTrack(active.id, track.id) }}
                      onEdit={() => { setActiveTrack(track, ''); setEditModalTracks([track]) }}
                      onDragStart={() => handleDragStart(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDrop={() => { void handleDrop() }}
                      onDragEnd={() => { setDragIdx(null); setDragOver(null) }}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="sl-grid">
                {setlistTracks.map((track, i) => (
                  <SetlistGridCard
                    key={track.id}
                    track={track}
                    index={i}
                    selected={selectedIds.has(track.id)}
                    onToggleSelect={() => toggleSelect(track.id)}
                    onPlay={() => handlePlay(track)}
                    isPlaying={currentTrack?.id === track.id && isPlaying}
                    onRemove={() => { void removeTrack(active.id, track.id) }}
                    onEdit={() => { setActiveTrack(track, ''); setEditModalTracks([track]) }}
                  />
                ))}
              </div>
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

      {editModalTracks && editModalTracks.length === 1 && (
        <TrackEditorModal
          track={editModalTracks[0]}
          onClose={() => setEditModalTracks(null)}
        />
      )}

      {editModalTracks && editModalTracks.length > 1 && (
        <SetlistBulkEditModal
          tracks={editModalTracks}
          onClose={() => setEditModalTracks(null)}
        />
      )}
    </div>
  )
}
