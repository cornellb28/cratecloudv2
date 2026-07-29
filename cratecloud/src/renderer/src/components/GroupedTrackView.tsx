import { useMemo, useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import type { Track } from '../types/track'

const UNKNOWN_LABEL = '(Unknown)'
const ROW_HEIGHT = 32

type Group = { name: string; tracks: Track[] }

// Lightweight grouped-list view — groups tracks by a single field (album or
// genre), click a group to filter, virtualized track list for scale. Not a
// clone of the Artist explorer's full feature set (no tag filters, no grid
// mode, no setlist picker) — scoped to the core "group tracks by X" ask.
function TrackRow({ index, tracks, style }: RowComponentProps<{ tracks: Track[] }>): React.JSX.Element {
  const { selected, toggleSelect, activeTrack } = useLibraryStore()
  const { playTrack } = usePlayerStore()
  const track = tracks[index]
  const isSelected = selected.has(track.id)
  const isPlaying = activeTrack?.id === track.id

  return (
    <div
      style={style}
      className={`gtv-track-row${isSelected ? ' gtv-track-row-selected' : ''}${isPlaying ? ' gtv-track-row-playing' : ''}`}
      onClick={(e) => { if (e.metaKey || e.ctrlKey) toggleSelect(track.id) }}
      onDoubleClick={() => playTrack(track)}
    >
      <span className="gtv-track-title">{track.title}</span>
      <span className="gtv-track-artist">{track.artist || <span className="lib-dim">—</span>}</span>
      <span className="gtv-track-bpm">{track.bpm || ''}</span>
      <span className="gtv-track-duration">{track.duration_str || ''}</span>
    </div>
  )
}

export function GroupedTrackView({
  field,
  heading,
}: {
  field: 'album' | 'genre'
  heading: string
}): React.JSX.Element {
  const { allTracks } = useLibraryStore()
  const tracks = allTracks()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const groups = useMemo<Group[]>(() => {
    const byName = new Map<string, Track[]>()
    for (const t of tracks) {
      const raw = (t[field] ?? '').trim()
      const name = raw || UNKNOWN_LABEL
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(t)
    }
    return [...byName.entries()]
      .map(([name, groupTracks]) => ({ name, tracks: groupTracks }))
      .sort((a, b) => {
        if (a.name === UNKNOWN_LABEL) return 1
        if (b.name === UNKNOWN_LABEL) return -1
        return a.name.localeCompare(b.name)
      })
  }, [tracks, field])

  const visibleTracks = selectedGroup
    ? groups.find((g) => g.name === selectedGroup)?.tracks ?? []
    : tracks

  return (
    <div className="gtv-root">
      <div className="gtv-groups">
        <div className="gtv-groups-heading">{heading}</div>
        <div
          className={`gtv-group-row${selectedGroup === null ? ' gtv-group-active' : ''}`}
          onClick={() => setSelectedGroup(null)}
        >
          <span className="gtv-group-name">All {heading}</span>
          <span className="gtv-group-count">{tracks.length}</span>
        </div>
        {groups.map((g) => (
          <div
            key={g.name}
            className={`gtv-group-row${selectedGroup === g.name ? ' gtv-group-active' : ''}`}
            onClick={() => setSelectedGroup(selectedGroup === g.name ? null : g.name)}
          >
            <span className="gtv-group-name">{g.name}</span>
            <span className="gtv-group-count">{g.tracks.length}</span>
          </div>
        ))}
      </div>

      <div className="gtv-tracks">
        <div className="gtv-tracks-header">
          <span>{selectedGroup ?? `All ${heading}`}</span>
          <span className="gtv-tracks-count">{visibleTracks.length} track{visibleTracks.length === 1 ? '' : 's'}</span>
        </div>
        {visibleTracks.length === 0 ? (
          <div className="gtv-empty">No tracks here yet.</div>
        ) : (
          <List
            rowComponent={TrackRow}
            rowCount={visibleTracks.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{ tracks: visibleTracks }}
            style={{ flex: 1 }}
          />
        )}
      </div>
    </div>
  )
}
