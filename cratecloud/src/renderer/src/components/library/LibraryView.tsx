import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { COLUMN_COLORS } from '../../types/track'
import type { Track } from '../../types/track'
import { TrackEditorModal } from '../TrackEditorModal'
import { TagInput } from '../TagInput'
import { matchesTrack, matchesTagFilters } from '../../utils/searchFilter'
import { useFolderStore } from '../../stores/useFolderStore'

type GroupedTracks = { name: string; color: string; tracks: Track[] }

function buildTrackMeta(f: Track): Record<string, string | undefined> {
  return {
    title: f.title || undefined,
    artist: f.artist || undefined,
    album: f.album || undefined,
    genre: f.genre || undefined,
    bpm: f.bpm || undefined,
    key: f.key || undefined,
    year: f.year || undefined,
    remixer: f.remixer || undefined,
    grouping: f.grouping || undefined,
    composer: f.composer || undefined,
    comment: f.comment || undefined,
    label: f.label || undefined,
  }
}

/* ── Inline editor rendered as a table row ── */
function ListEditorRow({ track, colSpan, onClose }: {
  track: Track
  colSpan: number
  onClose: () => void
}): React.JSX.Element {
  const { updateTrack, audioPort } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const [form, setForm] = useState<Track>({ ...track })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef<Track>({ ...track })
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const isFirstRender = useRef(true)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    pendingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveStatus('pending')
    debounceRef.current = setTimeout(() => {
      pendingRef.current = false
      debounceRef.current = null
      const f = formRef.current
      if (mountedRef.current) setSaveStatus('saving')
      updateTrack(f.id, f)
      if (f.filepath) {
        window.api.editTags(f.filepath, buildTrackMeta(f), true)
          .then((r) => { if (mountedRef.current) setSaveStatus(r.success ? 'saved' : 'error') })
          .catch(() => { if (mountedRef.current) setSaveStatus('error') })
      } else {
        if (mountedRef.current) setSaveStatus('saved')
      }
    }, 1000)
  }, [form])

  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => { if (mountedRef.current) setSaveStatus('idle') }, 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  useEffect(() => {
    return () => {
      if (debounceRef.current && pendingRef.current) {
        clearTimeout(debounceRef.current)
        const f = formRef.current
        updateTrack(f.id, f)
        if (f.filepath) window.api.editTags(f.filepath, buildTrackMeta(f), true).catch(() => {})
      }
    }
  }, [])

  const set = (field: keyof Track, value: string) => {
    const next = { ...formRef.current, [field]: value }
    formRef.current = next
    setForm(next)
  }

  const handleArtworkUpload = async () => {
    const saved = await window.api.artwork.pick(track.filepath ?? String(track.id))
    if (saved) {
      updateTrack(track.id, { artwork_path: saved } as Partial<Track>)
      if (audioPort) setArtworkSrc(`http://127.0.0.1:${audioPort}${saved}?t=${Date.now()}`)
    }
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
            <button
              className={`lib-expand-play-btn${currentTrack?.id === track.id ? ' active' : ''}`}
              onClick={() => {
                if (currentTrack?.id === track.id) togglePlayPause()
                else if (track.filepath) playTrack(track)
              }}
              disabled={!track.filepath}
              type="button"
              title={currentTrack?.id === track.id ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
            >
              {currentTrack?.id === track.id
                ? (isPlaying ? '⏸ Pause' : '▶ Resume')
                : '▶ Play'}
            </button>
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
                <TagInput field="genre" value={form.genre ?? ''} onChange={(v) => set('genre', v)} />
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
                <TagInput field="remixer" value={form.remixer ?? ''} onChange={(v) => set('remixer', v)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Label</div>
                <TagInput field="label" value={form.label ?? ''} onChange={(v) => set('label', v)} />
              </div>
            </div>
            <div className="ca-row">
              <div className="ca-field">
                <div className="ca-label">Grouping</div>
                <TagInput field="grouping" value={form.grouping ?? ''} onChange={(v) => set('grouping', v)} />
              </div>
              <div className="ca-field">
                <div className="ca-label">Composer</div>
                <TagInput field="composer" value={form.composer ?? ''} onChange={(v) => set('composer', v)} />
              </div>
            </div>
            <div className="ca-field">
              <div className="ca-label">Comment</div>
              <TagInput field="comment" value={form.comment ?? ''} onChange={(v) => set('comment', v)} />
            </div>

            <div className="lib-expand-actions">
              <div className="as-status">
                {saveStatus === 'pending' && <span className="as-pending">Unsaved…</span>}
                {saveStatus === 'saving' && <span className="as-saving">Saving…</span>}
                {saveStatus === 'saved' && <span className="as-saved">✓ Saved</span>}
                {saveStatus === 'error' && <span className="as-error">⚠ Save failed</span>}
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

export function LibraryView({ gridMode = false }: { gridMode?: boolean }): React.JSX.Element {
  const {
    columns, boards, setActiveTrack, activeTrack, searchQuery, activeFilter, advancedFilters,
    activeTagFilters, selected, toggleSelect, selectTracks, clearSelection, allTracks,
    crates, activeCrateId, setActiveCrate, activeFolderId, audioPort,
  } = useLibraryStore()
  const { allDescendantIds } = useFolderStore()
  const { openMenu } = useContextMenu()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null)
  const [modalTrack, setModalTrack] = useState<Track | null>(null)
  const lastClickedRef = useRef<number | null>(null)

  const boardColorMap = useMemo(
    () => Object.fromEntries(boards.map((b) => [b.name, b.color])),
    [boards]
  )

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

  const activeCrate = activeCrateId !== null ? crates.find((c) => c.id === activeCrateId) : null
  const activeFolderIds = activeFolderId !== null ? allDescendantIds(activeFolderId) : null

  const groups: GroupedTracks[] = Object.entries(columns)
    .map(([col, tracks]) => ({
      name: col,
      color: boardColorMap[col] ?? COLUMN_COLORS[col] ?? '#555',
      tracks: tracks.filter((t) => {
        if (activeCrate && !activeCrate.trackIds.has(t.id)) return false
        if (activeFolderIds && !activeFolderIds.has(t.folder_id ?? -1)) return false
        if (activeFilter === 'Untagged' && (t.bpm && t.key)) return false
        if (!matchesTrack(t, searchQuery, advancedFilters)) return false
        return matchesTagFilters(t, activeTagFilters)
      }),
    }))
    .filter((g) => g.tracks.length > 0)

  // Map trackId → board info, used by flat grid view
  const trackBoardMap = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>()
    groups.forEach((g) => g.tracks.forEach((t) => map.set(t.id, { name: g.name, color: g.color })))
    return map
  }, [groups])

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

  // Dragging a selected track drags the whole multi-selection; dragging an
  // unselected one drags just that track — matches conventional desktop UX.
  const handleDragStart = (e: React.DragEvent, track: Track) => {
    e.preventDefault()
    const paths = selected.has(track.id) && selected.size > 1
      ? allTracks()
          .filter((t) => selected.has(t.id))
          .map((t) => t.filepath)
          .filter((p): p is string => !!p)
      : track.filepath
        ? [track.filepath]
        : []
    if (paths.length) window.api.fs.startDrag(paths)
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
            const board = trackBoardMap.get(track.id)
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
                onContextMenu={(e) => handleContextMenu(e, track, board?.name ?? '')}
                draggable={!!track.filepath}
                onDragStart={(e) => handleDragStart(e, track)}
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
                {board && (
                  <div className="lib-grid-board">
                    <span className="lib-grid-board-dot" style={{ background: board.color }} />
                    <span className="lib-grid-board-name">{board.name}</span>
                    {track.status_is_manual && <span className="lib-grid-board-pin">⚲</span>}
                  </div>
                )}
              </div>
            )
          })}
          {allFilteredTracks.length === 0 && (
            <div className="lib-empty" style={{ gridColumn: '1/-1' }}>
              {searchQuery.trim() ? 'No tracks match your search.' : (
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
            <th className="lib-th lib-th-board">Board</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ name, color, tracks }) => (
            <React.Fragment key={name}>
              <tr className="lib-group-row" onClick={() => toggleCollapse(name)}>
                <td colSpan={12}>
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
                      draggable={!!track.filepath}
                      onDragStart={(e) => handleDragStart(e, track)}
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
                        onClick={(e) => { e.stopPropagation(); if (isCurrentlyPlaying) togglePlayPause(); else if (track.filepath) playTrack(track) }}
                        title={isCurrentlyPlaying ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
                      >
                        {isCurrentlyPlaying
                          ? <span className="lib-num-playing">{isPlaying ? '⏸' : '▶'}</span>
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
                      <td className="lib-td lib-td-board">
                        <div className="lib-board-pill" style={{ '--board-color': color } as React.CSSProperties}>
                          <span className="lib-board-dot" style={{ background: color }} />
                          <span className="lib-board-name">{name}</span>
                          {track.status_is_manual && <span className="lib-board-pin">⚲</span>}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <ListEditorRow
                        track={track}
                        colSpan={12}
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
          {searchQuery.trim() ? (
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
