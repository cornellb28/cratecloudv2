import { useCallback, useMemo, useState } from 'react'
import { useLibraryStore, rowToTrack } from '../stores/useLibraryStore'
import { useBrowserPagination } from '../hooks/useBrowserPagination'
import { useScrollSentinel } from '../hooks/useScrollSentinel'
import { useFreshenTracks } from '../hooks/useFreshenTracks'
import { TrackCard } from '../components/TrackCard'
import type { Board, Track } from '../types/track'
import { hashColor, sortTracks, SORT_OPTIONS, type ViewMode, type SortKey } from './browseShared'
import { ListPlaceholderRows, GridPlaceholderCards } from './browsePlaceholders'

// List mode now renders the canonical TrackCard (13 columns: check / # /
// art / title / artist / bpm / key / genre / energy / duration / format /
// board / actions) instead of its old hand-rolled 10-column table. The
// genre column is redundant here — every row shares the genre this whole
// view is scoped to — but TrackCard has no per-column visibility prop, and
// the trade is worth it: this view previously had no rename, move-to-
// folder, add-to-crate, or genre-edit at all. Flagging rather than quietly
// living with it.

// ── Board mode: one column per board, each independently paginated ──────────
// A dynamic number of board columns means a dynamic number of
// useBrowserPagination calls — React hooks can't be called a variable number
// of times in one component, so each column gets its own component instance
// instead (same pattern the app's real BoardColumn already uses).
function GenreBoardColumn({
  genre,
  boardName,
  boardColor,
  allBoards
}: {
  genre: string
  boardName: string
  boardColor: string
  allBoards: Board[]
}): React.JSX.Element {
  const { tracks, total, loading, hasMore, loadMore } = useBrowserPagination({
    fetchPage: (offset, limit) =>
      window.api.db
        .tracksByGenreAndColumn(genre, boardName, offset, limit)
        .then((rows) => rows.map(rowToTrack)),
    fetchTotal: () => window.api.db.tracksByGenreAndColumnCount(genre, boardName),
    pageSize: 50,
    key: `${genre}::${boardName}`
  })
  const sentinelRef = useScrollSentinel(loadMore, hasMore && !loading)
  const belongsInView = useCallback((t: Track) => t.genre === genre, [genre])
  const freshTracks = useFreshenTracks(tracks, belongsInView)

  return (
    <div className="col">
      <div className="col-header">
        <div className="col-header-dot" style={{ background: boardColor }} />
        <span className="col-title">{boardName}</span>
        <span className="col-count">{total}</span>
      </div>
      <div className="col-body">
        {freshTracks.map((t) => (
          <TrackCard
            key={t.id}
            track={t}
            viewContext={{ type: 'genre', id: genre }}
            displayMode="board"
            genreEditable
            leaving={t.leaving}
            col={boardName}
            allBoards={allBoards}
          />
        ))}
        {loading && <GridPlaceholderCards count={2} variant="board" />}
        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        {!hasMore && tracks.length === 0 && !loading && (
          <div className="col-drop-zone">No tracks</div>
        )}
      </div>
    </div>
  )
}

export function GenreView({ genre }: { genre: string }): React.JSX.Element {
  const { boards, selected, selectTracks, clearSelection } = useLibraryStore()

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('artist')

  const { tracks, total, loading, hasMore, error, loadMore } = useBrowserPagination({
    fetchPage: (offset, limit) =>
      window.api.db.tracksByGenre(genre, offset, limit).then((rows) => rows.map(rowToTrack)),
    fetchTotal: () => window.api.db.tracksByGenreCount(genre),
    pageSize: 75,
    key: genre
  })
  const sentinelRef = useScrollSentinel(loadMore, hasMore && !loading && viewMode !== 'board')

  const belongsInView = useCallback((t: Track) => t.genre === genre, [genre])
  const freshTracks = useFreshenTracks(tracks, belongsInView)

  // Client-side only — search/sort operate on whatever pages have loaded so
  // far, not the full genre; a genuine tradeoff of combining real pagination
  // with client-side filtering (there's no server-side query param for it).
  const visibleTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? freshTracks.filter(
          (t) => t.title.toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q)
        )
      : freshTracks
    return sortTracks(filtered, sortBy)
  }, [freshTracks, searchQuery, sortBy])

  const allVisibleIds = visibleTracks.map((t) => t.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  return (
    <div className="gv-root">
      <div className="gv-header">
        <div className="gv-header-title">
          <span className="gv-header-dot" style={{ background: hashColor(genre) }} />
          <span className="gv-header-name">{genre}</span>
        </div>
        <div className="gv-header-count">
          {total} track{total !== 1 ? 's' : ''}
        </div>
        <div className="gv-view-toggle">
          <button
            className={`btn btn-outline${viewMode === 'list' ? ' btn-active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            ≡ List
          </button>
          <button
            className={`btn btn-outline${viewMode === 'board' ? ' btn-active' : ''}`}
            onClick={() => setViewMode('board')}
          >
            ⊞ Board
          </button>
          <button
            className={`btn btn-outline${viewMode === 'grid' ? ' btn-active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            ⊟ Grid
          </button>
        </div>
      </div>

      <div className="gv-toolbar">
        <input
          className="board-search"
          placeholder={`Search within ${genre}…`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="adv-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        {viewMode !== 'board' && visibleTracks.length > 0 && (
          <div
            className={`lib-check${allSelected ? ' checked' : ''}`}
            onClick={() => (allSelected ? clearSelection() : selectTracks(allVisibleIds))}
            title={allSelected ? 'Deselect all' : 'Select all'}
            style={{ cursor: 'pointer' }}
          >
            {allSelected && <span>✓</span>}
          </div>
        )}
      </div>

      {error && (
        <div className="tm-excluded-note gv-error">
          {error}
          <button className="btn btn-outline" onClick={() => void loadMore()} style={{ marginLeft: 8 }}>
            Retry
          </button>
        </div>
      )}

      {!loading && total === 0 ? (
        <div className="lib-empty">
          <div className="lib-empty-title">No tracks in {genre}</div>
          <div className="lib-empty-sub">Add tracks with this genre tag to see them here</div>
        </div>
      ) : viewMode === 'board' ? (
        <div className="board-view-wrap">
          <div className="board">
            {boards.map((b) => (
              <GenreBoardColumn
                key={b.id}
                genre={genre}
                boardName={b.name}
                boardColor={b.color}
                allBoards={boards}
              />
            ))}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="lib-grid">
          {visibleTracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              viewContext={{ type: 'genre', id: genre }}
              displayMode="grid"
              genreEditable
              leaving={track.leaving}
              allBoards={boards}
            />
          ))}
          {loading && <GridPlaceholderCards count={4} variant="grid" />}
        </div>
      ) : (
        <div className="gv-list-wrap">
          <table className="lib-table">
            <thead>
              <tr className="lib-header-row">
                <th className="lib-th lib-th-check" />
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
              {visibleTracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  viewContext={{ type: 'genre', id: genre }}
                  displayMode="list"
                  genreEditable
                  leaving={track.leaving}
                  allBoards={boards}
                />
              ))}
              {loading && <ListPlaceholderRows count={3} />}
            </tbody>
          </table>
          {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          {!hasMore && total > 0 && (
            <div className="gv-all-loaded">
              All {total} tracks in {genre}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
