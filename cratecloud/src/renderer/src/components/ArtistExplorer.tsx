import React, { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useArtistExplorerStore } from '../stores/useArtistExplorerStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useSetlistStore } from '../stores/useSetlistStore'
import type { Track } from '../types/track'
import { MoveProgressModal, type MoveResult } from './MoveProgressModal'

const TAG_FIELDS = ['genre', 'label', 'remixer', 'comment', 'grouping', 'composer'] as const

const FIELD_LABELS: Record<string, string> = {
  genre: 'Genre', label: 'Label', remixer: 'Remixer',
  comment: 'Comment', grouping: 'Grouping', composer: 'Composer',
}

function splitField(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  return raw.split('/').map((s) => s.trim()).filter(Boolean)
}

// ── Setlist Picker Modal ──────────────────────────────────────────────────────
function SetlistPickerModal({
  trackIds,
  onClose,
}: {
  trackIds: number[]
  onClose: () => void
}): React.JSX.Element {
  const { setlists, addTrack, createSetlist } = useSetlistStore()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const visible = setlists.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const addTo = async (setlistId: number, name: string) => {
    if (busy) return
    setBusy(true)
    await Promise.all(trackIds.map((id) => addTrack(setlistId, id)))
    setFlash(`${trackIds.length} track${trackIds.length !== 1 ? 's' : ''} added to "${name}"`)
    setTimeout(onClose, 1500)
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    await createSetlist(name)
    const sl = useSetlistStore.getState().setlists.find((s) => s.name === name)
    if (sl) {
      await Promise.all(trackIds.map((id) => addTrack(sl.id, id)))
      setFlash(`${trackIds.length} track${trackIds.length !== 1 ? 's' : ''} added to "${name}"`)
      setTimeout(onClose, 1500)
    } else {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="ted-backdrop" onClick={onClose}>
      <div className="spm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="spm-header">
          <span>Add {trackIds.length} track{trackIds.length !== 1 ? 's' : ''} to setlist</span>
          <button className="ted-close" onClick={onClose} type="button">✕</button>
        </div>
        {flash ? (
          <div className="spm-flash">{flash}</div>
        ) : (
          <>
            <input
              className="spm-search"
              placeholder="Search setlists…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="spm-list">
              {visible.map((sl) => (
                <button
                  key={sl.id}
                  className="spm-item"
                  onClick={() => addTo(sl.id, sl.name)}
                  disabled={busy}
                  type="button"
                >
                  <span className="spm-item-name">{sl.name}</span>
                  <span className="spm-item-count">{sl.trackIds.length}</span>
                </button>
              ))}
              {visible.length === 0 && (
                <div className="spm-empty">No setlists found</div>
              )}
            </div>
            <div className="spm-footer">
              {creating ? (
                <div className="spm-create-row">
                  <input
                    className="spm-create-input"
                    placeholder="New setlist name…"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate()
                      if (e.key === 'Escape') setCreating(false)
                    }}
                    autoFocus
                  />
                  <button
                    className="spm-create-btn"
                    onClick={handleCreate}
                    disabled={busy || !newName.trim()}
                    type="button"
                  >
                    {busy ? '…' : 'Create'}
                  </button>
                </div>
              ) : (
                <button
                  className="spm-new-btn"
                  onClick={() => setCreating(true)}
                  type="button"
                >
                  + New setlist
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ArtistExplorer(): React.JSX.Element {
  const columns = useLibraryStore((s) => s.columns)
  const { updateTrack, audioPort } = useLibraryStore()
  const {
    selectedArtist, activeTags, filterMode, viewMode, selectedIds,
    selectArtist, toggleTag, clearFilters, setFilterMode, isTagActive,
    setViewMode, toggleSelect, setSelectedIds, clearSelection,
  } = useArtistExplorerStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const { setlists, init: initSetlists } = useSetlistStore()

  const [artistSearch, setArtistSearch] = useState('')
  const [showSetlistPicker, setShowSetlistPicker] = useState(false)
  const [movePhase, setMovePhase] = useState<
    null | 'moving' | { results: MoveResult[] }
  >(null)
  const lastClickedIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!setlists.length) initSetlists()
  }, [])

  const tracks = useMemo(() => Object.values(columns).flat(), [columns])

  const artists = useMemo(() => {
    const set = new Set<string>()
    for (const t of tracks) {
      const a = t.artist?.trim()
      if (a) set.add(a)
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [tracks])

  const visibleArtists = useMemo(() => {
    const q = artistSearch.trim().toLowerCase()
    return q ? artists.filter((a) => a.toLowerCase().includes(q)) : artists
  }, [artists, artistSearch])

  const tagCounts = useMemo(() => {
    if (!selectedArtist) return []
    const artistTracks = tracks.filter((t) => t.artist?.trim() === selectedArtist)
    const counts = new Map<string, number>()
    for (const track of artistTracks) {
      for (const field of TAG_FIELDS) {
        for (const val of splitField(track[field as keyof Track] as string)) {
          const key = `${field}\x00${val}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => {
        const sep = key.indexOf('\x00')
        return { field: key.slice(0, sep), value: key.slice(sep + 1), count }
      })
      .sort((a, b) => b.count - a.count)
  }, [selectedArtist, tracks])

  const maxCount = useMemo(
    () => Math.max(1, ...tagCounts.map((t) => t.count)),
    [tagCounts],
  )

  const groupedTags = useMemo(() => {
    const grouped: Record<string, typeof tagCounts> = {}
    for (const tc of tagCounts) {
      ;(grouped[tc.field] ??= []).push(tc)
    }
    return grouped
  }, [tagCounts])

  // Show artist's tracks when no tag filters active; cross-library filter when filters set
  const displayTracks = useMemo(() => {
    if (activeTags.length > 0) {
      return tracks.filter((track) => {
        if (filterMode === 'AND') {
          return activeTags.every(({ field, value }) =>
            splitField(track[field as keyof Track] as string).includes(value),
          )
        }
        return activeTags.some(({ field, value }) =>
          splitField(track[field as keyof Track] as string).includes(value),
        )
      })
    }
    if (selectedArtist) {
      return tracks.filter((t) => t.artist?.trim() === selectedArtist)
    }
    return []
  }, [activeTags, filterMode, selectedArtist, tracks])

  const selectedTracks = useMemo(
    () => displayTracks.filter((t) => selectedIds.has(t.id)),
    [displayTracks, selectedIds],
  )

  const allSelected =
    displayTracks.length > 0 && displayTracks.every((t) => selectedIds.has(t.id))

  const artUrl = (t: Track) =>
    t.artwork_path && audioPort ? `http://127.0.0.1:${audioPort}${t.artwork_path}` : null

  const handleCheckbox = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (e.shiftKey && lastClickedIdRef.current !== null) {
      const ids = displayTracks.map((t) => t.id)
      const fromIdx = ids.indexOf(lastClickedIdRef.current)
      const toIdx = ids.indexOf(id)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = [Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx)]
        const range = ids.slice(lo, hi + 1)
        setSelectedIds([...new Set([...selectedIds, ...range])])
        return
      }
    }
    toggleSelect(id)
    lastClickedIdRef.current = id
  }

  const handleMoveFiles = async () => {
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    setMovePhase('moving')
    const results: MoveResult[] = []
    for (const track of selectedTracks) {
      if (!track.filepath) {
        results.push({ track, success: false, error: 'No file path' })
        continue
      }
      try {
        const newPath = await window.api.fs.moveFile(track.filepath, folder)
        updateTrack(track.id, { filepath: newPath })
        results.push({ track, success: true, newPath })
      } catch (err) {
        results.push({ track, success: false, error: String(err) })
      }
    }
    setMovePhase({ results })
    clearSelection()
  }

  const resultsLabel =
    activeTags.length > 0
      ? `${displayTracks.length} track${displayTracks.length !== 1 ? 's' : ''} matching ${filterMode === 'OR' ? 'any' : 'all'} filters`
      : selectedArtist
        ? `${displayTracks.length} track${displayTracks.length !== 1 ? 's' : ''} by ${selectedArtist}`
        : ''

  return (
    <div className="artist-explorer">
      {/* ── Artist sidebar ── */}
      <div className="ae-sidebar">
        <div className="ae-sidebar-hd">Artists</div>
        <input
          className="ae-artist-search"
          placeholder="Search artists…"
          value={artistSearch}
          onChange={(e) => setArtistSearch(e.target.value)}
        />
        <div className="ae-artist-list">
          {visibleArtists.map((artist) => (
            <div
              key={artist}
              className={`ae-artist-item${selectedArtist === artist ? ' active' : ''}`}
              onClick={() => selectArtist(artist)}
            >
              {artist}
            </div>
          ))}
          {visibleArtists.length === 0 && (
            <div className="ae-hint">No artists found</div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="ae-main">
        {/* Active filter chips */}
        {activeTags.length > 0 && (
          <div className="ae-filter-bar">
            <span className="ae-filter-label">Filters:</span>
            {activeTags.map(({ field, value }) => (
              <div key={`${field}:${value}`} className="ae-chip">
                <span className="ae-chip-field">{FIELD_LABELS[field] ?? field}</span>
                <span className="ae-chip-sep">·</span>
                <span className="ae-chip-value">{value}</span>
                <button className="ae-chip-x" onClick={() => toggleTag(field, value)} title="Remove">×</button>
              </div>
            ))}
            <div className="ae-mode-group">
              <button
                className={`ae-mode-btn${filterMode === 'OR' ? ' active' : ''}`}
                onClick={() => setFilterMode('OR')}
                title="Match any selected tag"
              >OR</button>
              <button
                className={`ae-mode-btn${filterMode === 'AND' ? ' active' : ''}`}
                onClick={() => setFilterMode('AND')}
                title="Match all selected tags"
              >AND</button>
            </div>
            <button className="ae-clear-btn" onClick={clearFilters}>Clear all</button>
          </div>
        )}

        {/* Tag cloud */}
        <div className="ae-cloud-panel">
          {!selectedArtist ? (
            <div className="ae-empty">
              <div className="ae-empty-icon">♫</div>
              <div className="ae-empty-title">Select an artist</div>
              <div className="ae-empty-sub">Browse the list to explore tags by artist</div>
            </div>
          ) : tagCounts.length === 0 ? (
            <div className="ae-empty">
              <div className="ae-empty-icon">∅</div>
              <div className="ae-empty-title">No tags for {selectedArtist}</div>
              <div className="ae-empty-sub">Tag this artist's tracks to build a cloud</div>
            </div>
          ) : (
            <>
              <div className="ae-artist-heading">{selectedArtist}</div>
              {TAG_FIELDS.filter((f) => groupedTags[f]?.length).map((field) => (
                <div key={field} className="ae-field-group">
                  <span className="ae-field-label">{FIELD_LABELS[field]}</span>
                  <div className="ae-tag-cloud">
                    {groupedTags[field].map(({ value, count }) => {
                      const active = isTagActive(field, value)
                      const size = Math.round(11 + (count / maxCount) * 13)
                      return (
                        <button
                          key={value}
                          className={`ae-tag${active ? ' ae-tag-active' : ''}`}
                          style={{ fontSize: `${size}px` }}
                          onClick={() => toggleTag(field, value)}
                          title={`${FIELD_LABELS[field]}: ${value} — ${count} track${count !== 1 ? 's' : ''}`}
                        >
                          {value}
                          {count > 1 && <sup className="ae-tag-sup">{count}</sup>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Results section */}
        {(selectedArtist || activeTags.length > 0) && displayTracks.length > 0 && (
          <div className="ae-results">
            {/* Results header */}
            <div className="ae-results-hd">
              <div
                className={`ae-select-all${allSelected ? ' checked' : ''}`}
                onClick={() =>
                  allSelected
                    ? clearSelection()
                    : setSelectedIds(displayTracks.map((t) => t.id))
                }
                title={allSelected ? 'Deselect all' : 'Select all'}
              >
                {allSelected && '✓'}
              </div>
              <span className="ae-results-count">{resultsLabel}</span>
              <div className="ae-view-toggle">
                <button
                  className={`ae-view-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  ≡
                </button>
                <button
                  className={`ae-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                >
                  ⊞
                </button>
              </div>
            </div>

            {/* List view */}
            {viewMode === 'list' && (
              <div className="ae-list-wrap">
                <table className="lib-table">
                  <thead>
                    <tr className="lib-header-row">
                      <th className="lib-th lib-th-check" />
                      <th className="lib-th lib-th-num">#</th>
                      <th className="lib-th">Title</th>
                      <th className="lib-th">Artist</th>
                      <th className="lib-th lib-th-mono">BPM</th>
                      <th className="lib-th lib-th-mono">Key</th>
                      <th className="lib-th">Genre</th>
                      <th className="lib-th lib-th-mono">Energy</th>
                      <th className="lib-th">Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTracks.map((track, i) => {
                      const isCurrent = currentTrack?.id === track.id
                      const isSelected = selectedIds.has(track.id)
                      return (
                        <tr
                          key={track.id}
                          className={[
                            'lib-track-row',
                            isCurrent ? 'lib-playing' : '',
                            isSelected ? 'lib-selected' : '',
                          ].filter(Boolean).join(' ')}
                          onDoubleClick={() => track.filepath && playTrack(track)}
                        >
                          <td
                            className="lib-td lib-td-check"
                            onClick={(e) => handleCheckbox(e, track.id)}
                          >
                            <div className={`lib-check${isSelected ? ' checked' : ''}`}>
                              {isSelected && <span>✓</span>}
                            </div>
                          </td>
                          <td
                            className="lib-td lib-td-num"
                            onClick={() => {
                              if (isCurrent) togglePlayPause()
                              else if (track.filepath) playTrack(track)
                            }}
                            title={isCurrent ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
                          >
                            {isCurrent
                              ? <span className="lib-num-playing">{isPlaying ? '⏸' : '▶'}</span>
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
                          <td className="lib-td">{track.label || <span className="lib-dim">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Grid view */}
            {viewMode === 'grid' && (
              <div className="lib-grid ae-grid">
                {displayTracks.map((track) => {
                  const art = artUrl(track)
                  const isCurrent = currentTrack?.id === track.id
                  const isSelected = selectedIds.has(track.id)
                  return (
                    <div
                      key={track.id}
                      className={[
                        'lib-grid-item',
                        isCurrent ? 'lib-grid-playing' : '',
                        isSelected ? 'lib-grid-selected' : '',
                      ].filter(Boolean).join(' ')}
                      onDoubleClick={() => track.filepath && playTrack(track)}
                    >
                      <div className="lib-grid-art">
                        {art
                          ? <img src={art} className="lib-grid-img" draggable={false} />
                          : <div className="lib-grid-art-empty">♪</div>
                        }
                        <div
                          className={`lib-grid-check${isSelected ? ' checked' : ''}`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => handleCheckbox(e, track.id)}
                          title={isSelected ? 'Deselect' : 'Select'}
                        >
                          {isSelected && '✓'}
                        </div>
                        <button
                          className={`lib-grid-play-btn${isCurrent ? ' visible' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isCurrent) togglePlayPause()
                            else if (track.filepath) playTrack(track)
                          }}
                          type="button"
                          title={isCurrent ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
                        >
                          {isCurrent && isPlaying ? '⏸' : '▶'}
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
              </div>
            )}
          </div>
        )}

        {/* Empty results state */}
        {(selectedArtist || activeTags.length > 0) && displayTracks.length === 0 && activeTags.length > 0 && (
          <div className="ae-hint ae-hint-padded">No tracks match the current filters</div>
        )}

        {/* Action bar */}
        {selectedIds.size > 0 && (
          <div className="ae-action-bar">
            <span className="ae-action-count">
              {selectedIds.size} selected
            </span>
            <button
              className="ae-action-btn"
              onClick={() => {
                const first = selectedTracks.find((t) => t.filepath)
                if (first) playTrack(first)
              }}
              title="Play first selected track"
            >
              ▶ Play
            </button>
            <button
              className="ae-action-btn accent"
              onClick={() => setShowSetlistPicker(true)}
            >
              + Add to Setlist
            </button>
            <button
              className="ae-action-btn"
              onClick={handleMoveFiles}
              disabled={movePhase === 'moving'}
              title="Move files to a folder"
            >
              {movePhase === 'moving' ? '…Moving' : '↗ Move to…'}
            </button>
            <button
              className="ae-action-btn ae-action-clear"
              onClick={clearSelection}
            >
              ✕ Deselect
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showSetlistPicker && (
        <SetlistPickerModal
          trackIds={[...selectedIds]}
          onClose={() => setShowSetlistPicker(false)}
        />
      )}
      {movePhase !== null && movePhase !== 'moving' && (
        <MoveProgressModal
          results={movePhase.results}
          onClose={() => setMovePhase(null)}
        />
      )}
    </div>
  )
}
