import { useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { matchesTrack, DEFAULT_ADVANCED_FILTERS } from '../utils/searchFilter'
import {
  findMatches, hasMatchableData, loadMatchWeights, saveMatchWeights,
  type MatchResult, type MatchWeights,
} from '../utils/trackMatch'
import type { Track } from '../types/track'

function scoreClass(score: number): string {
  if (score >= 80) return 'tm-score-high'
  if (score >= 50) return 'tm-score-mid'
  return 'tm-score-low'
}

export function TrackMatchView(): React.JSX.Element {
  const { allTracks, selected, openCrateDialog } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()

  const tracks = allTracks()

  // Default to the current single-track selection, if there is exactly one.
  // Doesn't re-sync later — picking a source here shouldn't silently change
  // if the user's selection elsewhere changes while this view stays open.
  const [sourceId, setSourceId] = useState<number | null>(() =>
    selected.size === 1 ? [...selected][0] : null
  )
  const [pickerQuery, setPickerQuery] = useState('')

  // Power-user tuning, not the headline UI — persisted so a DJ's preferred
  // balance survives across sessions instead of resetting every launch.
  const [weights, setWeights] = useState<MatchWeights>(() => loadMatchWeights())

  const updateWeight = (key: keyof MatchWeights, value: number): void => {
    setWeights((prev) => {
      const next = { ...prev, [key]: value }
      saveMatchWeights(next)
      return next
    })
  }

  const sourceTrack = useMemo<Track | null>(
    () => (sourceId != null ? tracks.find((t) => t.id === sourceId) ?? null : null),
    [sourceId, tracks]
  )

  const { matches, excludedCount } = useMemo(() => {
    if (!sourceTrack || !hasMatchableData(sourceTrack)) return { matches: [] as MatchResult[], excludedCount: 0 }
    return findMatches(sourceTrack, tracks, weights)
  }, [sourceTrack, tracks, weights])

  // Local to this view — deliberately not the shared Library `selected` Set,
  // which means something different (library-wide bulk actions) and would
  // cross-contaminate with whatever's selected back in Library view.
  const [matchSelected, setMatchSelected] = useState<Set<number>>(new Set())

  // Source track is included by default when a new source is picked, but
  // stays togglable via its own checkbox in the header.
  useEffect(() => {
    setMatchSelected(sourceTrack ? new Set([sourceTrack.id]) : new Set())
  }, [sourceTrack?.id])

  const toggleMatchSelect = (id: number) => {
    setMatchSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createCrateFromSelection = () => {
    if (!sourceTrack) return
    // Source first (if included), then matches in descending-score order —
    // matches is already sorted, so filtering preserves that order.
    const orderedIds = [
      ...(matchSelected.has(sourceTrack.id) ? [sourceTrack.id] : []),
      ...matches.filter((m) => matchSelected.has(m.track.id)).map((m) => m.track.id),
    ]
    if (!orderedIds.length) return
    openCrateDialog('create', orderedIds)
  }

  const pickerResults = useMemo(() => {
    if (!pickerQuery.trim()) return tracks.slice(0, 200)
    return tracks.filter((t) => matchesTrack(t, pickerQuery, DEFAULT_ADVANCED_FILTERS)).slice(0, 200)
  }, [tracks, pickerQuery])

  // ── No source track chosen yet: picker ──────────────────────────────────
  if (!sourceTrack) {
    return (
      <div className="tm-view">
        <div className="tm-picker-header">
          <h2>Track Match</h2>
          <p className="tm-picker-sub">Pick a track to find harmonically + energy compatible matches in your library.</p>
          <input
            className="board-search"
            placeholder="Search by title, artist, bpm:, key:…"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="tm-picker-list">
          {pickerResults.map((t) => (
            <div key={t.id} className="tm-picker-row" onClick={() => setSourceId(t.id)}>
              <span className="tm-picker-title">{t.title}</span>
              <span className="tm-picker-artist">{t.artist}</span>
              <span className="tm-picker-meta">{t.camelot || '—'} · {t.bpm || '—'} bpm</span>
            </div>
          ))}
          {pickerResults.length === 0 && (
            <div className="lib-empty">
              <div className="lib-empty-title">No tracks match “{pickerQuery}”</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Source chosen but lacks bpm/camelot/energy ──────────────────────────
  if (!hasMatchableData(sourceTrack)) {
    return (
      <div className="tm-view">
        <div className="lib-empty">
          <div className="lib-empty-icon">✦</div>
          <div className="lib-empty-title">Not enough data to match “{sourceTrack.title}”</div>
          <div className="lib-empty-sub">
            Track Match needs BPM, key, and energy all analyzed — this track is missing at least one.
          </div>
          <button className="bem-btn primary" style={{ marginTop: 12 }} onClick={() => setSourceId(null)}>
            Choose a different track
          </button>
        </div>
      </div>
    )
  }

  // ── Ranked results ───────────────────────────────────────────────────────
  return (
    <div className="tm-view">
      <div className="tm-source-header">
        <label className="tm-source-check" title="Include source track in the crate">
          <input
            type="checkbox"
            checked={matchSelected.has(sourceTrack.id)}
            onChange={() => toggleMatchSelect(sourceTrack.id)}
          />
        </label>
        <div style={{ flex: 1 }}>
          <div className="tm-source-label">Matching against</div>
          <div className="tm-source-title">{sourceTrack.title} <span className="tm-source-artist">— {sourceTrack.artist}</span></div>
          <div className="tm-source-meta">{sourceTrack.camelot} · {sourceTrack.bpm} bpm · energy {sourceTrack.energy}</div>
        </div>
        <button className="bem-btn" onClick={() => setSourceId(null)}>Change track</button>
      </div>

      {matches.length === 0 ? (
        <div className="lib-empty">
          <div className="lib-empty-title">No compatible tracks found</div>
          <div className="lib-empty-sub">Every other analyzed track scored too low, or nothing else has BPM/key/energy data yet.</div>
        </div>
      ) : (
        <table className="tm-table">
          <thead>
            <tr>
              <th />
              <th />
              <th>Score</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Key</th>
              <th>BPM</th>
              <th>Energy</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const isCurrentlyPlaying = currentTrack?.id === m.track.id
              return (
                <tr key={m.track.id} className="lib-track-row">
                  <td className="lib-td lib-td-check" onClick={() => toggleMatchSelect(m.track.id)}>
                    <div className={`lib-check${matchSelected.has(m.track.id) ? ' checked' : ''}`}>
                      {matchSelected.has(m.track.id) && <span>✓</span>}
                    </div>
                  </td>
                  <td
                    className="lib-td lib-td-num"
                    onClick={() => (isCurrentlyPlaying ? togglePlayPause() : m.track.filepath && playTrack(m.track))}
                    title={isCurrentlyPlaying ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
                  >
                    {isCurrentlyPlaying ? (isPlaying ? '⏸' : '▶') : '▶'}
                  </td>
                  <td>
                    <span className={`tm-score ${scoreClass(m.score)}`} title={`Key ${m.camelot} · BPM ${m.bpm} · Energy ${m.energy}`}>
                      {m.score}
                    </span>
                  </td>
                  <td className="lib-td-title">{m.track.title}</td>
                  <td>{m.track.artist}</td>
                  <td>{m.track.camelot}</td>
                  <td>{m.track.bpm}</td>
                  <td>{m.track.energy}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {excludedCount > 0 && (
        <div className="tm-excluded-note">
          {excludedCount} track{excludedCount === 1 ? '' : 's'} excluded — missing BPM, key, or energy data.
        </div>
      )}

      <div className="tm-weights">
        <div className="tm-weights-label">Match weighting</div>
        <div className="tm-weight-row">
          <span className="tm-weight-name">Key</span>
          <input
            className="tm-weight-slider"
            type="range"
            min={0}
            max={100}
            value={weights.camelot}
            onChange={(e) => updateWeight('camelot', Number(e.target.value))}
          />
          <span className="tm-weight-value">{weights.camelot}</span>
        </div>
        <div className="tm-weight-row">
          <span className="tm-weight-name">BPM</span>
          <input
            className="tm-weight-slider"
            type="range"
            min={0}
            max={100}
            value={weights.bpm}
            onChange={(e) => updateWeight('bpm', Number(e.target.value))}
          />
          <span className="tm-weight-value">{weights.bpm}</span>
        </div>
        <div className="tm-weight-row">
          <span className="tm-weight-name">Energy</span>
          <input
            className="tm-weight-slider"
            type="range"
            min={0}
            max={100}
            value={weights.energy}
            onChange={(e) => updateWeight('energy', Number(e.target.value))}
          />
          <span className="tm-weight-value">{weights.energy}</span>
        </div>
      </div>

      {matchSelected.size > 0 && (
        <div className="bulk-bar tm-selection-bar">
          <span>{matchSelected.size} track{matchSelected.size !== 1 ? 's' : ''} selected</span>
          <button className="bulk-btn accent" onClick={createCrateFromSelection}>
            ⊞ Create Crate from Selection
          </button>
          <button className="bulk-btn danger" style={{ marginLeft: 'auto' }} onClick={() => setMatchSelected(new Set())}>
            ✕ Deselect
          </button>
        </div>
      )}
    </div>
  )
}
