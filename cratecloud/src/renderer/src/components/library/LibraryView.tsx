import React, { useState } from 'react'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useContextMenu } from '../../contexts/ContextMenuContext'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { COLUMN_COLORS } from '../../types/track'
import type { Track } from '../../types/track'

type GroupedTracks = { name: string; color: string; tracks: Track[] }

export function LibraryView(): React.JSX.Element {
  const {
    columns, setActiveTrack, activeTrack, searchQuery, selected, toggleSelect,
    crates, activeCrateId, setActiveCrate,
  } = useLibraryStore()
  const { openMenu } = useContextMenu()
  const { playTrack, currentTrack, isPlaying } = usePlayerStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const q = searchQuery.toLowerCase()
  const activeCrate = activeCrateId !== null ? crates.find((c) => c.id === activeCrateId) : null

  const groups: GroupedTracks[] = Object.entries(columns)
    .map(([col, tracks]) => ({
      name: col,
      color: COLUMN_COLORS[col] ?? '#555',
      tracks: tracks.filter((t) => {
        if (activeCrate && !activeCrate.trackIds.has(t.id)) return false
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q)
        )
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
            <th className="lib-th lib-th-check" />
            <th className="lib-th lib-th-num">#</th>
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
              <tr
                key={`group-${name}`}
                className="lib-group-row"
                onClick={() => toggleCollapse(name)}
              >
                <td colSpan={10}>
                  <span className="lib-group-chevron">
                    {collapsed.has(name) ? '▶' : '▼'}
                  </span>
                  <span className="lib-group-dot" style={{ background: color }} />
                  <span className="lib-group-name">{name}</span>
                  <span className="lib-group-count">{tracks.length}</span>
                </td>
              </tr>

              {!collapsed.has(name) &&
                tracks.map((track, i) => {
                  const isSelected = selected.has(track.id)
                  const isActive = activeTrack?.id === track.id
                  const isCurrentlyPlaying = currentTrack?.id === track.id
                  return (
                    <tr
                      key={track.id}
                      className={[
                        'lib-track-row',
                        isActive ? 'active' : '',
                        isSelected ? 'lib-selected' : '',
                        isCurrentlyPlaying ? 'lib-playing' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setActiveTrack(track, name)}
                      onDoubleClick={() => track.filepath && playTrack(track)}
                      onContextMenu={(e) => handleContextMenu(e, track, name)}
                    >
                      <td
                        className="lib-td lib-td-check"
                        onClick={(e) => { e.stopPropagation(); toggleSelect(track.id) }}
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
