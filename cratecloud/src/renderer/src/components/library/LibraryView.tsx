import React, { useState, useMemo } from 'react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { COLUMN_COLORS } from '../../types/track'
import type { Track } from '../../types/track'
import { TrackCard } from '../TrackCard'
import { matchesTrack, matchesTagFilters } from '../../utils/searchFilter'
import { useFolderStore } from '../../stores/useFolderStore'

type GroupedTracks = { name: string; color: string; tracks: Track[] }

// Column count for group-row/empty-state colSpan — keep in sync with the
// <thead> below. 13, not 12: TrackCard's list mode added a trailing
// actions column (rename/move/crate/⋯) that didn't exist before Section 3.
const LIST_COLUMN_COUNT = 13

export function LibraryView({ gridMode = false }: { gridMode?: boolean }): React.JSX.Element {
  const {
    columns, boards, searchQuery, activeFilter, advancedFilters,
    activeTagFilters, selected, selectTracks, clearSelection,
    crates, activeCrateId, setActiveCrate, activeFolderId,
  } = useLibraryStore()
  const { allDescendantIds } = useFolderStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const boardColorMap = useMemo(
    () => Object.fromEntries(boards.map((b) => [b.name, b.color])),
    [boards]
  )

  const activeCrate = activeCrateId !== null ? crates.find((c) => c.id === activeCrateId) : null
  const activeFolderIds = activeFolderId !== null ? allDescendantIds(activeFolderId) : null

  const groups: GroupedTracks[] = Object.entries(columns)
    .map(([col, tracks]) => ({
      name: col,
      color: boardColorMap[col] ?? COLUMN_COLORS[col] ?? 'var(--color-text-disabled)',
      tracks: tracks.filter((t) => {
        if (activeCrate && !activeCrate.trackIds.has(t.id)) return false
        if (activeFolderIds && !activeFolderIds.has(t.folder_id ?? -1)) return false
        if (activeFilter === 'Untagged' && (t.bpm && t.key)) return false
        if (!matchesTrack(t, searchQuery, advancedFilters)) return false
        return matchesTagFilters(t, activeTagFilters)
      }),
    }))
    .filter((g) => g.tracks.length > 0)

  const totalTracks = groups.reduce((n, g) => n + g.tracks.length, 0)

  const toggleCollapse = (name: string): void => {
    const next = new Set(collapsed)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setCollapsed(next)
  }

  const allFilteredTracks = groups.flatMap((g) => g.tracks)
  const allFilteredIds = allFilteredTracks.map((t) => t.id)
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id))

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
          {groups.map((g) =>
            g.tracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                viewContext={{ type: 'library' }}
                displayMode="grid"
                genreEditable
                col={g.name}
                allBoards={boards}
              />
            ))
          )}
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
            <th className="lib-th lib-th-actions" />
          </tr>
        </thead>
        <tbody>
          {groups.map(({ name, color, tracks }) => (
            <React.Fragment key={name}>
              <tr className="lib-group-row" onClick={() => toggleCollapse(name)}>
                <td colSpan={LIST_COLUMN_COUNT}>
                  <span className="lib-group-chevron">{collapsed.has(name) ? '▶' : '▼'}</span>
                  <span className="lib-group-dot" style={{ background: color }} />
                  <span className="lib-group-name">{name}</span>
                  <span className="lib-group-count">{tracks.length}</span>
                </td>
              </tr>

              {!collapsed.has(name) && tracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  viewContext={{ type: 'library' }}
                  displayMode="list"
                  genreEditable
                  col={name}
                  allBoards={boards}
                />
              ))}
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
