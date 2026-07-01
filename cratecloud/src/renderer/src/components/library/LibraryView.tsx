import React, { useState, useEffect, useRef } from 'react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useTagStore, type TagField } from '../../stores/useTagStore'
import { COLUMN_COLORS } from '../../types/track'
import type { Track } from '../../types/track'
import { TrackEditorModal } from '../TrackEditorModal'

type GroupedTracks = { name: string; color: string; tracks: Track[] }

/* ── Inline editor rendered as a table row ── */
function ListEditorRow({ track, colSpan, onClose }: {
  track: Track
  colSpan: number
  onClose: () => void
}): React.JSX.Element {
  const { updateTrack, audioPort } = useLibraryStore()
  const { tagsForField } = useTagStore()
  const [form, setForm] = useState<Track>({ ...track })
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )

  const set = (field: keyof Track, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
    updateTrack(form.id, form)
    if (form.filepath) {
      try {
        const meta: Record<string, string | undefined> = {
          title: form.title || undefined,
          artist: form.artist || undefined,
          album: form.album || undefined,
          genre: form.genre || undefined,
          bpm: form.bpm || undefined,
          key: form.key || undefined,
          year: form.year || undefined,
          remixer: form.remixer || undefined,
          grouping: form.grouping || undefined,
          composer: form.composer || undefined,
          comment: form.comment || undefined,
          label: form.label || undefined,
        }
        const r = await window.api.editTags(form.filepath, meta, true)
        if (r.success) {
          setSaveNote(r.serato_written ? 'Saved · Serato updated' : 'Saved')
          setSaving(false)
          setTimeout(onClose, 700)
          return
        }
        setSaveNote(`Error: ${r.error}`)
      } catch (err) {
        setSaveNote(`Error: ${String(err)}`)
      }
    } else {
      setSaving(false)
      setTimeout(onClose, 700)
      return
    }
    setSaving(false)
  }

  const handleArtworkUpload = async () => {
    const saved = await window.api.artwork.pick(track.filepath ?? String(track.id))
    if (saved) {
      updateTrack(track.id, { artwork_path: saved } as Partial<Track>)
      if (audioPort) setArtworkSrc(`http://127.0.0.1:${audioPort}${saved}?t=${Date.now()}`)
    }
  }

  const TagSuggestions = ({ field, currentValue, onSelect }: {
    field: TagField; currentValue: string; onSelect: (v: string) => void
  }) => {
    const tags = tagsForField(field)
    if (!tags.length) return null
    return (
      <div className="insp-tag-suggestions">
        {tags.map((tag) => {
          const already = currentValue.split('/').map((s) => s.trim()).includes(tag.value)
          return (
            <button
              key={tag.id}
              className={`insp-tag-chip${already ? ' insp-tag-chip-active' : ''}`}
              style={{ borderColor: tag.color, color: tag.color }}
              onClick={() => {
                if (already) return
                const parts = currentValue.split('/').map((s) => s.trim()).filter(Boolean)
                onSelect([...parts, tag.value].join('/'))
              }}
              type="button"
            >
              {tag.value}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <tr className="lib-expand-row">
      <td colSpan={colSpan}>
        <div className="lib-expand-inner">
          {/* Artwork column */}
          <div className="lib-expand-art-col">
            <div className="lib-expand-art-wrap" onClick={handleArtworkUpload} title="Click to change artwork">
              {artworkSrc
                ? <img className="lib-expand-art" src={artworkSrc} onError={() => setArtworkSrc(undefined)} draggable={false} />
                : <div className="lib-expand-art-empty">♪</div>
              }
              <div className="ted-art-overlay">Change</div>
            </div>
            <button className="lib-expand-art-btn" onClick={handleArtworkUpload} type="button">
              {artworkSrc ? 'Change art' : '+ Add art'}
            </button>
            <div className="lib-expand-meta">
              {track.duration_str && <div>{track.duration_str}</div>}
              {track.format && <div>{track.format}</div>}
              {track.file_size_mb != null && <div>{track.file_size_mb} MB</div>}
            </div>
            <button className="lib-expand-close" onClick={onClose} type="button">✕ Close</button>
          </div>

          {/* Fields column */}
          <div className="lib-expand-fields">
            <div className="ca-row">
              <div className="ca-field">
                <div className="ca-label">Title</div>
                <input className="ca-input" value={form.title} onChange={(e) => set('title', e.target.value)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Artist</div>
                <input className="ca-input" value={form.artist} onChange={(e) => set('artist', e.target.value)} />
              </div>
            </div>
            <div className="ca-row">
              <div className="ca-field">
                <div className="ca-label">BPM</div>
                <input className="ca-input" value={form.bpm} placeholder="—" onChange={(e) => set('bpm', e.target.value)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Key</div>
                <input className="ca-input" value={form.key} placeholder="—" onChange={(e) => set('key', e.target.value)} />
              </div>
            </div>
            <div className="ca-row">
              <div className="ca-field">
                <div className="ca-label">Genre</div>
                <input className="ca-input" value={form.genre} placeholder="—" onChange={(e) => set('genre', e.target.value)} />
                <TagSuggestions field="genre" currentValue={form.genre ?? ''} onSelect={(v) => set('genre', v)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Album</div>
                <input className="ca-input" value={form.album ?? ''} placeholder="—" onChange={(e) => set('album', e.target.value)} />
              </div>
            </div>
            <div className="ca-row">
              <div className="ca-field">
                <div className="ca-label">Energy</div>
                <input className="ca-input" value={form.energy} placeholder="—" onChange={(e) => set('energy', e.target.value)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Year</div>
                <input className="ca-input" value={form.year ?? ''} placeholder="—" onChange={(e) => set('year', e.target.value)} />
              </div>
            </div>
            <div className="ca-row">
              <div className="ca-field">
                <div className="ca-label">Remixer</div>
                <input className="ca-input" value={form.remixer ?? ''} placeholder="—" onChange={(e) => set('remixer', e.target.value)} />
                <TagSuggestions field="remixer" currentValue={form.remixer ?? ''} onSelect={(v) => set('remixer', v)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Label</div>
                <input className="ca-input" value={form.label ?? ''} placeholder="—" onChange={(e) => set('label', e.target.value)} />
                <TagSuggestions field="label" currentValue={form.label ?? ''} onSelect={(v) => set('label', v)} />
              </div>
            </div>
            <div className="ca-field">
              <div className="ca-label">Comment</div>
              <input className="ca-input" value={form.comment ?? ''} placeholder="—" onChange={(e) => set('comment', e.target.value)} />
            </div>

            <div className="lib-expand-actions">
              {saveNote && <span className="lib-expand-save-note">{saveNote}</span>}
              <button className="ca-save-btn" style={{ width: 'auto', padding: '7px 20px' }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

export function LibraryView({ gridMode = false }: { gridMode?: boolean }): React.JSX.Element {
  const {
    columns, setActiveTrack, activeTrack, searchQuery, activeFilter, selected, toggleSelect,
    selectTracks, clearSelection, crates, activeCrateId, setActiveCrate, audioPort,
  } = useLibraryStore()
  const { openMenu } = useContextMenu()
  const { playTrack, currentTrack, isPlaying } = usePlayerStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null)
  const [modalTrack, setModalTrack] = useState<Track | null>(null)
  const lastClickedRef = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      if ((e.key === 'c' || e.key === 'Escape') && !inInput) {
        setExpandedTrackId(null)
        setModalTrack(null)
      }
      if (e.key === ' ' && !inInput) { e.preventDefault(); usePlayerStore.getState().togglePlayPause() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = searchQuery.toLowerCase()
  const activeCrate = activeCrateId !== null ? crates.find((c) => c.id === activeCrateId) : null

  const passesFilter = (t: Track): boolean => {
    if (activeFilter === 'Untagged') return !t.bpm || !t.key
    if (activeFilter === '8A–8B') return t.key === '8A' || t.key === '8B'
    if (activeFilter === '128–132 BPM') {
      const bpm = parseFloat(t.bpm)
      return !isNaN(bpm) && bpm >= 128 && bpm <= 132
    }
    return true
  }

  const groups: GroupedTracks[] = Object.entries(columns)
    .map(([col, tracks]) => ({
      name: col,
      color: COLUMN_COLORS[col] ?? '#555',
      tracks: tracks.filter((t) => {
        if (activeCrate && !activeCrate.trackIds.has(t.id)) return false
        if (!passesFilter(t)) return false
        if (!q) return true
        return [
          t.title, t.artist, t.genre, t.bpm, t.key, t.energy,
          t.album, t.year, t.remixer, t.label, t.comment,
          t.composer, t.grouping, t.format, t.camelot, t.openkey,
        ].some((v) => v?.toLowerCase().includes(q))
      }),
    }))
    .filter((g) => g.tracks.length > 0)

  const totalTracks = groups.reduce((n, g) => n + g.tracks.length, 0)

  const toggleCollapse = (name: string) => {
    const next = new Set(collapsed)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setCollapsed(next)
  }

  const handleContextMenu = (e: React.MouseEvent, track: Track, col: string) => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, track, col)
  }

  const artUrl = (t: Track) =>
    t.artwork_path && audioPort ? `http://127.0.0.1:${audioPort}${t.artwork_path}` : null

  const allFilteredTracks = groups.flatMap((g) => g.tracks)
  const allFilteredIds = allFilteredTracks.map((t) => t.id)
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id))

  const handleCheckboxClick = (e: React.MouseEvent, trackId: number) => {
    e.stopPropagation()
    if (e.shiftKey && lastClickedRef.current !== null) {
      const lastIdx = allFilteredIds.indexOf(lastClickedRef.current)
      const currIdx = allFilteredIds.indexOf(trackId)
      if (lastIdx !== -1 && currIdx !== -1) {
        const [from, to] = [Math.min(lastIdx, currIdx), Math.max(lastIdx, currIdx)]
        const rangeIds = allFilteredIds.slice(from, to + 1)
        selectTracks([...new Set([...selected, ...rangeIds])])
        return
      }
    }
    toggleSelect(trackId)
    lastClickedRef.current = trackId
  }

  /* ── Grid view ── */
  if (gridMode) {
    return (
      <div className="library">
        {activeCrate && (
          <div className="lib-crate-banner" style={{ borderColor: activeCrate.color }}>
            <span className="lib-crate-dot" style={{ background: activeCrate.color }} />
            <span className="lib-crate-name">{activeCrate.name}</span>
            <span className="lib-crate-count">{activeCrate.trackIds.size} tracks</span>
            <button className="lib-crate-clear" onClick={() => setActiveCrate(null)}>✕</button>
          </div>
        )}
        <div className="lib-summary">
          {totalTracks} track{totalTracks !== 1 ? 's' : ''}
          {selected.size > 0 && <span className="lib-summary-sel"> · {selected.size} selected</span>}
        </div>
        <div className="lib-grid">
          {allFilteredTracks.map((track) => {
            const art = artUrl(track)
            const isCurrentlyPlaying = currentTrack?.id === track.id
            const isSelected = selected.has(track.id)
            return (
              <div
                key={track.id}
                className={[
                  'lib-grid-item',
                  isCurrentlyPlaying ? 'lib-grid-playing' : '',
                  isSelected ? 'lib-grid-selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setModalTrack(track)}
                onDoubleClick={() => track.filepath && playTrack(track)}
                onContextMenu={(e) => handleContextMenu(e, track, track.title)}
              >
                <div className="lib-grid-art">
                  {art
                    ? <img src={art} className="lib-grid-img" draggable={false} />
                    : <div className="lib-grid-art-empty">♪</div>
                  }
                  <div
                    className={`lib-grid-check${isSelected ? ' checked' : ''}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(track.id) }}
                    title={isSelected ? 'Deselect' : 'Select'}
                  >
                    {isSelected && '✓'}
                  </div>
                  <button
                    className={`lib-grid-play-btn${isCurrentlyPlaying ? ' visible' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isCurrentlyPlaying) usePlayerStore.getState().togglePlayPause()
                      else if (track.filepath) playTrack(track)
                    }}
                    type="button"
                    title={isCurrentlyPlaying ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
                  >
                    {isCurrentlyPlaying && isPlaying ? '⏸' : '▶'}
                  </button>
                </div>
                <div className="lib-grid-title">{track.title}</div>
                <div className="lib-grid-artist">{track.artist || '—'}</div>
                <div className="lib-grid-tags">
                  {track.bpm && <span className="lib-tag bpm">{track.bpm}</span>}
                  {track.key && <span className="lib-tag key">{track.key}</span>}
                </div>
              </div>
            )
          })}
          {allFilteredTracks.length === 0 && (
            <div className="lib-empty" style={{ gridColumn: '1/-1' }}>
              {q ? 'No tracks match your search.' : (
                <>
                  <div className="lib-empty-icon">⬇</div>
                  <div className="lib-empty-title">Drop music here to import</div>
                  <div className="lib-empty-sub">Or use <strong>Import Folder</strong> or <strong>Add Files</strong> above</div>
                </>
              )}
            </div>
          )}
        </div>

        {modalTrack && (
          <TrackEditorModal track={modalTrack} onClose={() => setModalTrack(null)} />
        )}
      </div>
    )
  }

  /* ── List view ── */
  return (
    <div className="library">
      {activeCrate && (
        <div className="lib-crate-banner" style={{ borderColor: activeCrate.color }}>
          <span className="lib-crate-dot" style={{ background: activeCrate.color }} />
          <span className="lib-crate-name">{activeCrate.name}</span>
          <span className="lib-crate-count">{activeCrate.trackIds.size} tracks</span>
          <button className="lib-crate-clear" onClick={() => setActiveCrate(null)} title="Show all tracks">✕</button>
        </div>
      )}
      <div className="lib-summary">
        {totalTracks} track{totalTracks !== 1 ? 's' : ''} · {groups.length} group{groups.length !== 1 ? 's' : ''}
        {selected.size > 0 && (
          <span className="lib-summary-sel"> · {selected.size} selected</span>
        )}
      </div>

      <table className="lib-table">
        <thead>
          <tr className="lib-header-row">
            <th className="lib-th lib-th-check">
              <div
                className={`lib-check${allSelected ? ' checked' : ''}`}
                onClick={() => allSelected ? clearSelection() : selectTracks(allFilteredIds)}
                title={allSelected ? 'Deselect all' : 'Select all'}
                style={{ cursor: 'pointer' }}
              >
                {allSelected && <span>✓</span>}
              </div>
            </th>
            <th className="lib-th lib-th-num">#</th>
            <th className="lib-th lib-th-art" />
            <th className="lib-th">Title</th>
            <th className="lib-th">Artist</th>
            <th className="lib-th lib-th-mono">BPM</th>
            <th className="lib-th lib-th-mono">Key</th>
            <th className="lib-th">Genre</th>
            <th className="lib-th lib-th-mono">Energy</th>
            <th className="lib-th lib-th-mono">Duration</th>
            <th className="lib-th lib-th-mono">Format</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ name, color, tracks }) => (
            <React.Fragment key={name}>
              <tr className="lib-group-row" onClick={() => toggleCollapse(name)}>
                <td colSpan={11}>
                  <span className="lib-group-chevron">{collapsed.has(name) ? '▶' : '▼'}</span>
                  <span className="lib-group-dot" style={{ background: color }} />
                  <span className="lib-group-name">{name}</span>
                  <span className="lib-group-count">{tracks.length}</span>
                </td>
              </tr>

              {!collapsed.has(name) && tracks.map((track, i) => {
                const isSelected = selected.has(track.id)
                const isActive = activeTrack?.id === track.id
                const isCurrentlyPlaying = currentTrack?.id === track.id
                const isExpanded = expandedTrackId === track.id

                return (
                  <React.Fragment key={track.id}>
                    <tr
                      className={[
                        'lib-track-row',
                        isActive ? 'active' : '',
                        isSelected ? 'lib-selected' : '',
                        isCurrentlyPlaying ? 'lib-playing' : '',
                        isExpanded ? 'lib-row-expanded' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        setActiveTrack(track, name)
                        setExpandedTrackId((id) => id === track.id ? null : track.id)
                      }}
                      onDoubleClick={() => track.filepath && playTrack(track)}
                      onContextMenu={(e) => handleContextMenu(e, track, name)}
                    >
                      <td
                        className="lib-td lib-td-check"
                        onClick={(e) => handleCheckboxClick(e, track.id)}
                      >
                        <div className={`lib-check${isSelected ? ' checked' : ''}`}>
                          {isSelected && <span>✓</span>}
                        </div>
                      </td>
                      <td
                        className="lib-td lib-td-num"
                        onClick={(e) => { e.stopPropagation(); if (track.filepath) playTrack(track) }}
                        title="Play"
                      >
                        {isCurrentlyPlaying
                          ? <span className="lib-num-playing">{isPlaying ? '▶' : '⏸'}</span>
                          : <><span className="lib-num-idx">{i + 1}</span><span className="lib-num-play">▶</span></>
                        }
                      </td>
                      <td className="lib-td lib-td-art">
                        {artUrl(track)
                          ? <img className="lib-art-thumb" src={artUrl(track)!} draggable={false} />
                          : <div className="lib-art-empty">♪</div>}
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
                      <td className="lib-td lib-td-mono">{track.format || <span className="lib-dim">—</span>}</td>
                    </tr>

                    {isExpanded && (
                      <ListEditorRow
                        track={track}
                        colSpan={11}
                        onClose={() => setExpandedTrackId(null)}
                      />
                    )}
                  </React.Fragment>
                )
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {groups.length === 0 && (
        <div className="lib-empty">
          {q ? (
            'No tracks match your search.'
          ) : (
            <>
              <div className="lib-empty-icon">⬇</div>
              <div className="lib-empty-title">Drop music here to import</div>
              <div className="lib-empty-sub">
                Or use <strong>Import Folder</strong> or <strong>Add Files</strong> above
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
