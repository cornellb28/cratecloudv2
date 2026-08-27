import { useCallback, useMemo, useState } from 'react'
import { useLibraryStore, rowToTrack } from '../stores/useLibraryStore'
import { useBrowserPagination } from '../hooks/useBrowserPagination'
import { useScrollSentinel } from '../hooks/useScrollSentinel'
import { useFreshenTracks } from '../hooks/useFreshenTracks'
import { TrackCard } from '../components/TrackCard'
import type { Board, Track } from '../types/track'
import { hashColor, sortTracks, SORT_OPTIONS, type ViewMode, type SortKey } from './browseShared'
import { ListPlaceholderRows, GridPlaceholderCards } from './browsePlaceholders'

// ── Board mode: one column per board, each independently paginated ──────────
// Same reasoning as GenreView's GenreBoardColumn — a dynamic number of board
// columns means a dynamic number of useBrowserPagination calls, which needs
// one component instance per column, not a loop of hook calls.
function ArtistBoardColumn({
  artist,
  boardName,
  boardColor,
  allBoards
}: {
  artist: string
  boardName: string
  boardColor: string
  allBoards: Board[]
}): React.JSX.Element {
  const { tracks, total, loading, hasMore, loadMore } = useBrowserPagination({
    fetchPage: (offset, limit) =>
      window.api.db
        .tracksByArtistAndColumn(artist, boardName, offset, limit)
        .then((rows) => rows.map(rowToTrack)),
    fetchTotal: () => window.api.db.tracksByArtistAndColumnCount(artist, boardName),
    pageSize: 50,
    key: `${artist}::${boardName}`
  })
  const sentinelRef = useScrollSentinel(loadMore, hasMore && !loading)
  const belongsInView = useCallback((t: Track) => t.artist === artist, [artist])
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
            viewContext={{ type: 'artist', id: artist }}
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

export function ArtistView({ artist }: { artist: string }): React.JSX.Element {
  const { boards, selected, selectTracks, clearSelection } = useLibraryStore()

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  // Every row shares the same artist, so sorting by Artist would be an inert
  // no-op — Title is the meaningful default here (GenreView defaults to
  // Artist for the same reason, inverted).
  const [sortBy, setSortBy] = useState<SortKey>('title')

  const { tracks, total, loading, hasMore, error, loadMore } = useBrowserPagination({
    fetchPage: (offset, limit) =>
      window.api.db.tracksByArtist(artist, offset, limit).then((rows) => rows.map(rowToTrack)),
    fetchTotal: () => window.api.db.tracksByArtistCount(artist),
    pageSize: 75,
    key: artist
  })
  const sentinelRef = useScrollSentinel(loadMore, hasMore && !loading && viewMode !== 'board')

  const belongsInView = useCallback((t: Track) => t.artist === artist, [artist])
  const freshTracks = useFreshenTracks(tracks, belongsInView)

  // Client-side only — search/sort operate on whatever pages have loaded so
  // far, not the full artist catalog; a genuine tradeoff of combining real
  // pagination with client-side filtering (there's no server-side query
  // param for it). Searches title/genre here (not title/artist, since every
  // row already shares the same artist — genre is what actually varies).
  const visibleTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? freshTracks.filter(
          (t) => t.title.toLowerCase().includes(q) || (t.genre || '').toLowerCase().includes(q)
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
          <span className="gv-header-dot" style={{ background: hashColor(artist) }} />
          <span className="gv-header-name">{artist}</span>
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
          placeholder={`Search within ${artist}…`}
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
          <div className="lib-empty-title">No tracks by {artist}</div>
          <div className="lib-empty-sub">Add tracks by this artist to see them here</div>
        </div>
      ) : viewMode === 'board' ? (
        <div className="board-view-wrap">
          <div className="board">
            {boards.map((b) => (
              <ArtistBoardColumn
                key={b.id}
                artist={artist}
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
              viewContext={{ type: 'artist', id: artist }}
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
                  viewContext={{ type: 'artist', id: artist }}
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
              All {total} tracks by {artist}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
