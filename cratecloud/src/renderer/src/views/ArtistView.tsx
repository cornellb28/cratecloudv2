import { useMemo, useState } from 'react'
import { useLibraryStore, rowToTrack } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useContextMenu } from '../contexts/ContextMenuContext'
import { useBrowserPagination } from '../hooks/useBrowserPagination'
import { useScrollSentinel } from '../hooks/useScrollSentinel'
import { TrackCard } from '../components/board/TrackCard'
import { TrackEditorModal } from '../components/TrackEditorModal'
import type { Track, Board } from '../types/track'
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

  return (
    <div className="col">
      <div className="col-header">
        <div className="col-header-dot" style={{ background: boardColor }} />
        <span className="col-title">{boardName}</span>
        <span className="col-count">{total}</span>
      </div>
      <div className="col-body">
        {tracks.map((t) => (
          <TrackCard key={t.id} track={t} col={boardName} allBoards={allBoards} />
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
  const { boards, selected, toggleSelect, selectTracks, clearSelection, audioPort } =
    useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const { openMenu } = useContextMenu()

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState('')
  // Every row shares the same artist, so sorting by Artist would be an inert
  // no-op — Title is the meaningful default here (GenreView defaults to
  // Artist for the same reason, inverted).
  const [sortBy, setSortBy] = useState<SortKey>('title')
  const [modalTrack, setModalTrack] = useState<Track | null>(null)
  const lastClickedRef = useState<{ current: number | null }>(() => ({ current: null }))[0]

  const { tracks, total, loading, hasMore, error, loadMore } = useBrowserPagination({
    fetchPage: (offset, limit) =>
      window.api.db.tracksByArtist(artist, offset, limit).then((rows) => rows.map(rowToTrack)),
    fetchTotal: () => window.api.db.tracksByArtistCount(artist),
    pageSize: 75,
    key: artist
  })
  const sentinelRef = useScrollSentinel(loadMore, hasMore && !loading && viewMode !== 'board')

  // Client-side only — search/sort operate on whatever pages have loaded so
  // far, not the full artist catalog; a genuine tradeoff of combining real
  // pagination with client-side filtering (there's no server-side query
  // param for it). Searches title/genre here (not title/artist, since every
  // row already shares the same artist — genre is what actually varies).
  const visibleTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? tracks.filter(
          (t) => t.title.toLowerCase().includes(q) || (t.genre || '').toLowerCase().includes(q)
        )
      : tracks
    return sortTracks(filtered, sortBy)
  }, [tracks, searchQuery, sortBy])

  const allVisibleIds = visibleTracks.map((t) => t.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  const artUrl = (t: Track): string | null =>
    t.artwork_path && audioPort ? `http://127.0.0.1:${audioPort}${t.artwork_path}` : null

  const handleCheckboxClick = (e: React.MouseEvent, trackId: number): void => {
    e.stopPropagation()
    if (e.shiftKey && lastClickedRef.current !== null) {
      const lastIdx = allVisibleIds.indexOf(lastClickedRef.current)
      const currIdx = allVisibleIds.indexOf(trackId)
      if (lastIdx !== -1 && currIdx !== -1) {
        const [from, to] = [Math.min(lastIdx, currIdx), Math.max(lastIdx, currIdx)]
        selectTracks([...new Set([...selected, ...allVisibleIds.slice(from, to + 1)])])
        return
      }
    }
    toggleSelect(trackId)
    lastClickedRef.current = trackId
  }

  const handleContextMenu = (e: React.MouseEvent, track: Track): void => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, track, track.column_name ?? '')
  }

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
          {visibleTracks.map((track) => {
            const art = artUrl(track)
            const isCurrent = currentTrack?.id === track.id
            const isSelected = selected.has(track.id)
            return (
              <div
                key={track.id}
                className={[
                  'lib-grid-item',
                  isCurrent ? 'lib-grid-playing' : '',
                  isSelected ? 'lib-grid-selected' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setModalTrack(track)}
                onDoubleClick={() => track.filepath && playTrack(track)}
                onContextMenu={(e) => handleContextMenu(e, track)}
              >
                <div className="lib-grid-art">
                  {art ? (
                    <img src={art} className="lib-grid-img" draggable={false} />
                  ) : (
                    <div className="lib-grid-art-empty">♪</div>
                  )}
                  <div
                    className={`lib-grid-check${isSelected ? ' checked' : ''}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelect(track.id)
                    }}
                  >
                    {isSelected && '✓'}
                  </div>
                  <button
                    className={`lib-grid-play-btn${isCurrent ? ' visible' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      isCurrent ? togglePlayPause() : track.filepath && playTrack(track)
                    }}
                    type="button"
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
                <th className="lib-th">Genre</th>
                <th className="lib-th lib-th-mono">BPM</th>
                <th className="lib-th lib-th-mono">Key</th>
                <th className="lib-th lib-th-mono">Energy</th>
                <th className="lib-th lib-th-mono">Duration</th>
                <th className="lib-th lib-th-board">Board</th>
              </tr>
            </thead>
            <tbody>
              {visibleTracks.map((track, i) => {
                const isSelected = selected.has(track.id)
                const isCurrent = currentTrack?.id === track.id
                const board = boards.find((b) => b.name === track.column_name)
                return (
                  <tr
                    key={track.id}
                    className={[
                      'lib-track-row',
                      isSelected ? 'lib-selected' : '',
                      isCurrent ? 'lib-playing' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setModalTrack(track)}
                    onDoubleClick={() => track.filepath && playTrack(track)}
                    onContextMenu={(e) => handleContextMenu(e, track)}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        isCurrent ? togglePlayPause() : track.filepath && playTrack(track)
                      }}
                    >
                      {isCurrent ? (
                        <span className="lib-num-playing">{isPlaying ? '⏸' : '▶'}</span>
                      ) : (
                        <>
                          <span className="lib-num-idx">{i + 1}</span>
                          <span className="lib-num-play">▶</span>
                        </>
                      )}
                    </td>
                    <td className="lib-td lib-td-art">
                      {artUrl(track) ? (
                        <img className="lib-art-thumb" src={artUrl(track)!} draggable={false} />
                      ) : (
                        <div className="lib-art-empty">♪</div>
                      )}
                    </td>
                    <td className="lib-td lib-td-title">{track.title}</td>
                    <td className="lib-td lib-td-artist">
                      {track.genre || <span className="lib-dim">—</span>}
                    </td>
                    <td className="lib-td lib-td-mono">
                      {track.bpm ? (
                        <span className="lib-tag bpm">{track.bpm}</span>
                      ) : (
                        <span className="lib-dim">—</span>
                      )}
                    </td>
                    <td className="lib-td lib-td-mono">
                      {track.key ? (
                        <span className="lib-tag key">{track.key}</span>
                      ) : (
                        <span className="lib-dim">—</span>
                      )}
                    </td>
                    <td className="lib-td lib-td-mono">
                      {track.energy ? (
                        <span className="lib-tag energy">E{track.energy}</span>
                      ) : (
                        <span className="lib-dim">—</span>
                      )}
                    </td>
                    <td className="lib-td lib-td-mono">
                      {track.duration_str || <span className="lib-dim">—</span>}
                    </td>
                    <td className="lib-td lib-td-board">
                      {board && (
                        <div
                          className="lib-board-pill"
                          style={{ '--board-color': board.color } as React.CSSProperties}
                        >
                          <span className="lib-board-dot" style={{ background: board.color }} />
                          <span className="lib-board-name">{board.name}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
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

      {modalTrack && <TrackEditorModal track={modalTrack} onClose={() => setModalTrack(null)} />}
    </div>
  )
}
