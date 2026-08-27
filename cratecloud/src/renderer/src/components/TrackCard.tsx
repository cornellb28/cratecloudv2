import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Track, Board, ViewContext } from '../types/track'
import { COLUMN_COLORS } from '../types/track'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useTrackCardActions } from '../hooks/useTrackCardActions'
import { TrackEditorModal } from './TrackEditorModal'
import { CratePicker } from './CratePicker'
import { InlineGenreEditor } from './InlineGenreEditor'

export type DisplayMode = 'list' | 'board' | 'grid'

interface Props {
  track: Track
  viewContext: ViewContext
  displayMode: DisplayMode
  isSelected?: boolean
  isPlaying?: boolean
  // Set by useFreshenTracks when this track no longer matches the current
  // view (e.g. its genre was edited away from the genre this view is
  // scoped to) — fades the row out via CSS instead of an instant vanish.
  leaving?: boolean
  // Inline click-to-edit genre tag — off by default, per spec.
  genreEditable?: boolean
  // Optional controlled-selection override. No real call site uses these
  // yet — omitted, this falls back to the shared useLibraryStore `selected`
  // Set/toggleSelect, same as every existing track surface in the app.
  onSelect?: (track: Track) => void
  onDeselect?: (track: Track) => void
  // Board-mode-only (move-to-column dropdown + dnd-kit column data).
  // Falls back to track.column_name in list/grid, where there's no
  // meaningful "current column" context to require from the caller.
  col?: string
  allBoards?: Board[]
}

// Canonical track row/card — see Section 1 gap audit. Board mode below is
// the pre-existing board/TrackCard.tsx behavior, unchanged. List and grid
// modes carry the same feature set (rename, move to folder, add to crate,
// inline genre edit, context menu, missing state) that only board mode had
// before. Shared rename/move/genre-edit/click logic lives in
// useTrackCardActions (see Section 3) so FolderHierarchyView's tree rows
// can reuse it without being forced into this component's table-row shape.
//
// KNOWN REGRESSION vs pre-Section-3 LibraryView: shift-click range-select
// on the checkbox isn't implemented here. That needs the parent's ordered
// list of visible track IDs and a "last clicked" ref, which doesn't fit as
// a self-contained concern of one row — onSelect/onDeselect don't carry
// the click event today, so a parent can't reimplement it through those
// callbacks either without a prop-contract change.
export function TrackCard({
  track,
  viewContext,
  displayMode,
  isSelected: isSelectedProp,
  isPlaying: isPlayingProp,
  leaving = false,
  genreEditable = false,
  onSelect,
  onDeselect,
  col,
  allBoards = [],
}: Props): React.JSX.Element {
  const { audioPort, allTracks } = useLibraryStore()

  // Not consumed here — the "moved state" fade (see `leaving` prop below)
  // is computed by the caller (useFreshenTracks/useLeaveTransition), which
  // already knows the view's scope. viewContext is kept on the prop
  // contract for any future per-context rendering that isn't just the fade.
  void viewContext

  const {
    isSelected: hookIsSelected, isCurrentTrack, isActive, isMissing, isRenaming, effectiveCol,
    playerIsPlaying, modalOpen, setModalOpen, moveDdOpen, setMoveDdOpen,
    cratePickerOpen, setCratePickerOpen, crateBtnRef, moveError, renameValue, setRenameValue,
    renameError, setRenameError, genreEditorOpen, setGenreEditorOpen, genreError,
    startRename, commitRename, cancelRename, handleMoveToFolder, handleGenreSelect,
    handleToggleSelect: hookHandleToggleSelect, handleRowClick, handleContextMenu,
    handlePlayToggle, handleKeyDown, moveTrack, resetTrackStatus,
  } = useTrackCardActions(track, col)
  // onSelect/onDeselect override: only used if the parent actually passed
  // one (no real call site does yet — see Props comment above).
  const isSelected = isSelectedProp ?? hookIsSelected
  const isCurrentlyPlaying = isPlayingProp ?? (isCurrentTrack && playerIsPlaying)
  const boardColor = allBoards.find((b) => b.name === effectiveCol)?.color
    ?? COLUMN_COLORS[effectiveCol]
    ?? 'var(--color-text-disabled)'
  const handleToggleSelect = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (onSelect || onDeselect) {
      if (isSelected) onDeselect?.(track)
      else onSelect?.(track)
    } else {
      hookHandleToggleSelect(e)
    }
  }

  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )
  useEffect(() => {
    if (track.artwork_path && audioPort) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtworkSrc(`http://127.0.0.1:${audioPort}${track.artwork_path}`)
    }
  }, [track.artwork_path, audioPort])

  // Board mode: dnd-kit cross-column drag. List/grid: plain native drag
  // (drag files out to the OS) — disabled here means dnd-kit attaches no
  // listeners, so the native onDragStart below is free to run instead.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { type: 'track', track, col: effectiveCol },
    disabled: displayMode !== 'board',
  })
  const dndStyle = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  const handleNativeDragStart = (e: React.DragEvent): void => {
    e.preventDefault()
    const sel = useLibraryStore.getState().selected
    const paths = sel.has(track.id) && sel.size > 1
      ? allTracks().filter((t) => sel.has(t.id)).map((t) => t.filepath).filter((p): p is string => !!p)
      : track.filepath ? [track.filepath] : []
    if (paths.length) window.api.fs.startDrag(paths)
  }

  const renderGenreTag = (dimEmpty: boolean): React.JSX.Element | null => {
    if (!track.genre && !genreEditable) return null
    if (!genreEditable) return <span className="tag genre">{track.genre}</span>
    return (
      <span
        className={`tag genre ige-trigger${!track.genre ? ' dim' : ''}`}
        onClick={(e) => { e.stopPropagation(); setGenreEditorOpen(true) }}
      >
        {track.genre || (dimEmpty ? 'Genre?' : '—')} <span className="ige-chevron">▾</span>
        {genreEditorOpen && (
          <InlineGenreEditor
            value={track.genre}
            onSelect={(v) => void handleGenreSelect(v)}
            onClose={() => setGenreEditorOpen(false)}
          />
        )}
      </span>
    )
  }

  const playButton = (
    <button
      className={[
        'chab', 'chab-play',
        isCurrentTrack && playerIsPlaying ? 'playing' : '',
        isCurrentTrack && !playerIsPlaying ? 'paused' : '',
      ].filter(Boolean).join(' ')}
      onClick={handlePlayToggle}
      disabled={isMissing || !track.filepath}
      title={isMissing ? 'File missing on disk' : (isCurrentTrack && playerIsPlaying ? 'Pause' : 'Play')}
      type="button"
    >
      {isCurrentTrack && playerIsPlaying ? '⏸' : '▶'}
    </button>
  )

  const threeDotButton = (
    <button className="chab" onClick={handleContextMenu} title="More actions" type="button">⋯</button>
  )

  // ── Board mode — unchanged from the pre-existing board/TrackCard.tsx ────
  if (displayMode === 'board') {
    return (
      <>
        <div
          ref={setNodeRef}
          style={dndStyle}
          {...attributes}
          {...listeners}
          className={[
            'track-card',
            isSelected ? 'selected' : '',
            isDragging ? 'dragging' : '',
            leaving ? 'tc-leaving' : '',
          ].filter(Boolean).join(' ')}
          onClick={handleRowClick}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          onBlur={() => setMoveDdOpen(false)}
        >
          <div className="card-header">
            {artworkSrc ? (
              <img
                className="card-art-thumb"
                src={artworkSrc}
                onError={() => setArtworkSrc(undefined)}
                draggable={false}
              />
            ) : (
              <div className="card-art-placeholder">♪</div>
            )}
            <div className="card-header-info">
              {isRenaming ? (
                <div
                  className="card-rename-wrap"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    className="card-rename-input"
                    value={renameValue}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') { e.preventDefault(); void commitRename() }
                      if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                    }}
                    onBlur={cancelRename}
                  />
                  <div className={`card-rename-hint${renameError ? ' error' : ''}`}>
                    {renameError ?? 'Enter to save · Esc to cancel'}
                  </div>
                </div>
              ) : (
                <>
                  <div className="track-title">{track.title}</div>
                  <div className="track-artist">{track.artist || <span style={{ color: 'var(--color-text-disabled)' }}>—</span>}</div>
                  {moveError && <div className="card-move-error">{moveError}</div>}
                  {genreError && <div className="card-move-error">{genreError}</div>}
                </>
              )}
            </div>
            <div className="card-header-actions" onPointerDown={(e) => e.stopPropagation()}>
              {track.status_is_manual && (
                <span className="card-pin-badge" title="Manually pinned to this board">⚲</span>
              )}
              {threeDotButton}
              <div className="card-move-wrap">
                <button
                  className="card-move-btn"
                  onClick={(e) => { e.stopPropagation(); setMoveDdOpen(!moveDdOpen) }}
                  title="Move to board"
                  type="button"
                >
                  ↗
                </button>
                {moveDdOpen && (
                  <div className="card-move-dd" onClick={(e) => e.stopPropagation()}>
                    {track.status_is_manual && (
                      <>
                        <div
                          className="card-move-item card-move-reset"
                          onClick={() => { void resetTrackStatus(track.id); setMoveDdOpen(false) }}
                        >
                          ↺ Reset to auto
                        </div>
                        <div className="card-move-sep" />
                      </>
                    )}
                    {allBoards.filter((b) => b.name !== effectiveCol).map((b) => (
                      <div
                        key={b.id}
                        className="card-move-item"
                        onClick={() => { moveTrack(track.id, effectiveCol, b.name); setMoveDdOpen(false) }}
                      >
                        <span className="card-move-dot" style={{ background: b.color }} />
                        {b.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`track-check${isSelected ? ' checked' : ''}`} onClick={handleToggleSelect}>
                {isSelected && <span className="check-mark">✓</span>}
              </div>
            </div>
          </div>

          <div className="track-tags-wrap">
            <div className="track-tags">
              <span className={`tag bpm${!track.bpm ? ' dim' : ''}`}>{track.bpm || 'BPM?'}</span>
              <span className={`tag key${!track.key ? ' dim' : ''}`}>{track.key || 'Key?'}</span>
              {renderGenreTag(false)}
              {track.energy && <span className="tag energy">E{track.energy}</span>}
              {isMissing && <span className="tag missing">Missing</span>}
            </div>

            {!isRenaming && (
              <div
                className="card-hover-actions"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {playButton}
                <button className="chab" onClick={startRename} disabled={!track.filepath} title="Rename file" type="button">✎</button>
                <button className="chab" onClick={() => void handleMoveToFolder()} disabled={!track.filepath} title="Move to folder" type="button">📁</button>
                <button ref={crateBtnRef} className="chab" onClick={() => setCratePickerOpen(!cratePickerOpen)} title="Add to crate" type="button">+</button>
              </div>
            )}

            {cratePickerOpen && (
              <CratePicker trackId={track.id} anchorRef={crateBtnRef} onClose={() => setCratePickerOpen(false)} />
            )}
          </div>
        </div>

        {modalOpen && <TrackEditorModal track={track} onClose={() => setModalOpen(false)} />}
      </>
    )
  }

  // ── List mode ─────────────────────────────────────────────────────────
  if (displayMode === 'list') {
    return (
      <>
        <tr
          className={[
            'lib-track-row',
            isActive ? 'active' : '',
            isSelected ? 'lib-selected' : '',
            isCurrentlyPlaying ? 'lib-playing' : '',
            leaving ? 'tc-leaving' : '',
          ].filter(Boolean).join(' ')}
          onClick={handleRowClick}
          onContextMenu={handleContextMenu}
          draggable={!!track.filepath}
          onDragStart={handleNativeDragStart}
        >
          <td className="lib-td lib-td-check" onClick={handleToggleSelect}>
            <div className={`lib-check${isSelected ? ' checked' : ''}`}>{isSelected && <span>✓</span>}</div>
          </td>
          <td
            className="lib-td lib-td-num"
            onClick={handlePlayToggle}
            title={isMissing ? 'File not found on disk' : (isCurrentTrack ? (playerIsPlaying ? 'Pause' : 'Resume') : 'Play')}
            style={isMissing ? { cursor: 'default' } : undefined}
          >
            {isCurrentTrack ? (
              <span className="lib-num-playing">{playerIsPlaying ? '⏸' : '▶'}</span>
            ) : (
              <span className="lib-num-play" style={isMissing ? { opacity: 0.3 } : undefined}>▶</span>
            )}
          </td>
          <td className="lib-td lib-td-art">
            {artworkSrc
              ? <img className="lib-art-thumb" src={artworkSrc} onError={() => setArtworkSrc(undefined)} draggable={false} />
              : <div className="lib-art-empty">♪</div>}
          </td>
          <td className="lib-td lib-td-title">
            {isRenaming ? (
              <div className="card-rename-wrap" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <input
                  className="ca-input"
                  value={renameValue}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); void commitRename() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                  }}
                  onBlur={cancelRename}
                />
                {renameError && <div className="lm-rename-error">{renameError}</div>}
              </div>
            ) : (
              <>
                {track.title}
                {isMissing && (
                  <span className="tag missing" style={{ marginLeft: 6 }} title="File not found on disk">
                    ⚠ Missing
                  </span>
                )}
              </>
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
            {genreEditable
              ? renderGenreTag(false) ?? (
                <span className="lib-dim ige-trigger" onClick={(e) => { e.stopPropagation(); setGenreEditorOpen(true) }}>
                  — <span className="ige-chevron">▾</span>
                  {genreEditorOpen && (
                    <InlineGenreEditor value="" onSelect={(v) => void handleGenreSelect(v)} onClose={() => setGenreEditorOpen(false)} />
                  )}
                </span>
              )
              : (track.genre || <span className="lib-dim">—</span>)}
          </td>
          <td className="lib-td lib-td-mono">
            {track.energy ? <span className="lib-tag energy">E{track.energy}</span> : <span className="lib-dim">—</span>}
          </td>
          <td className="lib-td lib-td-mono">{track.duration_str || <span className="lib-dim">—</span>}</td>
          <td className="lib-td lib-td-mono">{track.format || <span className="lib-dim">—</span>}</td>
          <td className="lib-td lib-td-board">
            {effectiveCol && (
              <div className="lib-board-pill" style={{ '--board-color': boardColor } as React.CSSProperties}>
                <span className="lib-board-dot" style={{ background: boardColor }} />
                <span className="lib-board-name">{effectiveCol}</span>
                {track.status_is_manual && <span className="lib-board-pin">⚲</span>}
              </div>
            )}
          </td>
          <td className="lib-td lib-td-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {!isRenaming && (
              <div className="lib-row-actions">
                <button className="chab" onClick={startRename} disabled={!track.filepath} title="Rename file" type="button">✎</button>
                <button className="chab" onClick={() => void handleMoveToFolder()} disabled={!track.filepath} title="Move to folder" type="button">📁</button>
                <button ref={crateBtnRef} className="chab" onClick={() => setCratePickerOpen(!cratePickerOpen)} title="Add to crate" type="button">+</button>
                {threeDotButton}
              </div>
            )}
            {cratePickerOpen && (
              <CratePicker trackId={track.id} anchorRef={crateBtnRef} onClose={() => setCratePickerOpen(false)} />
            )}
          </td>
        </tr>
        {modalOpen && <TrackEditorModal track={track} onClose={() => setModalOpen(false)} />}
      </>
    )
  }

  // ── Grid mode ─────────────────────────────────────────────────────────
  const art = track.artwork_path && audioPort ? `http://127.0.0.1:${audioPort}${track.artwork_path}` : null
  return (
    <>
      <div
        className={[
          'lib-grid-item',
          isCurrentlyPlaying ? 'lib-grid-playing' : '',
          isSelected ? 'lib-grid-selected' : '',
          leaving ? 'tc-leaving' : '',
        ].filter(Boolean).join(' ')}
        onClick={handleRowClick}
        onContextMenu={handleContextMenu}
        draggable={!!track.filepath}
        onDragStart={handleNativeDragStart}
      >
        <div className="lib-grid-art">
          {art ? <img src={art} className="lib-grid-img" draggable={false} /> : <div className="lib-grid-art-empty">♪</div>}
          {isMissing && <div className="lib-grid-missing-dot" title="File not found on disk" />}
          <div
            className={`lib-grid-check${isSelected ? ' checked' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleToggleSelect}
            title={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected && '✓'}
          </div>
          <button
            className={`lib-grid-play-btn${isCurrentlyPlaying ? ' visible' : ''}`}
            onClick={handlePlayToggle}
            type="button"
            disabled={isMissing}
            title={isMissing ? 'File not found on disk' : (isCurrentTrack ? (playerIsPlaying ? 'Pause' : 'Resume') : 'Play')}
          >
            {isCurrentTrack && playerIsPlaying ? '⏸' : '▶'}
          </button>
          <button className="btn btn-icon btn-ghost lib-grid-menu-btn" onClick={handleContextMenu} title="More actions" type="button">⋯</button>
        </div>
        <div className="lib-grid-title">{track.title}</div>
        <div className="lib-grid-artist">{track.artist || '—'}</div>
        <div className="lib-grid-tags">
          {track.key && <span className="lib-tag key">{track.key}</span>}
        </div>
        {effectiveCol && (
          <div className="lib-grid-board">
            <span className="lib-grid-board-dot" style={{ background: boardColor }} />
            <span className="lib-grid-board-name">{effectiveCol}</span>
            {track.status_is_manual && <span className="lib-grid-board-pin">⚲</span>}
          </div>
        )}
      </div>
      {modalOpen && <TrackEditorModal track={track} onClose={() => setModalOpen(false)} />}
    </>
  )
}
