import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { hashColor } from './browseShared'
import type { Track } from '../types/track'

type Category = 'genre' | 'artist' | 'energy' | 'board'
type LabelField = 'genre' | 'artist'

type ValueRow = {
  value: string
  count: number
  // Other raw values that normalize to the same key as this one (case /
  // whitespace variants) — present only on the canonical (highest-count)
  // row of a duplicate group.
  duplicatesOf?: string[]
}

// Catches both "Tech House" vs "tech house" (case) and "TechHouse" vs
// "Tech House" (whitespace) with one cheap, deterministic normalization —
// no fuzzy/edit-distance library needed for the two cases named in spec.
function normalizeKey(v: string): string {
  return v.toLowerCase().trim().replace(/\s+/g, '')
}

function groupDuplicates(raw: { value: string; count: number }[]): ValueRow[] {
  const groups = new Map<string, { value: string; count: number }[]>()
  for (const r of raw) {
    const key = normalizeKey(r.value)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  const rows: ValueRow[] = []
  for (const members of groups.values()) {
    members.sort((a, b) => b.count - a.count)
    const [canonical, ...rest] = members
    rows.push({
      value: canonical.value,
      count: canonical.count,
      duplicatesOf: rest.length > 0 ? rest.map((m) => m.value) : undefined,
    })
  }
  rows.sort((a, b) => b.count - a.count)
  return rows
}

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'genre', label: 'Genres' },
  { id: 'artist', label: 'Artists' },
  { id: 'energy', label: 'Energy levels' },
  { id: 'board', label: 'Board columns' },
]

export function LabelManagerView(): React.JSX.Element {
  const { allTracks, selectTracks, setActiveView, boards, columns, setSelectedGenre, setSelectedArtist } =
    useLibraryStore()

  const [category, setCategory] = useState<Category>('genre')
  const [rawValues, setRawValues] = useState<{ value: string; count: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [previewValue, setPreviewValue] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [merging, setMerging] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const isLabelField = category === 'genre' || category === 'artist'

  const loadValues = useCallback((field: LabelField) => {
    setLoading(true)
    setPreviewValue(null)
    window.api.db
      .labelValueCounts(field)
      .then((rows) => setRawValues(rows))
      .catch((err) => console.error('[label-manager] labelValueCounts failed:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Category-change → refetch is the intended pattern here (same as
    // useBrowserPagination's key-change reset), not a disguised anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (category === 'genre' || category === 'artist') loadValues(category)
    setMenuFor(null)
    setRenaming(null)
    setMerging(null)
  }, [category, loadValues])

  const genreArtistCounts = useMemo(() => {
    const genres = new Set<string>()
    const artists = new Set<string>()
    for (const t of allTracks()) {
      if (t.genre?.trim()) genres.add(t.genre.trim())
      if (t.artist?.trim()) artists.add(t.artist.trim())
    }
    return { genres: genres.size, artists: artists.size }
  }, [allTracks])

  const energyDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of allTracks()) {
      const e = t.energy?.trim()
      if (e) counts.set(e, (counts.get(e) ?? 0) + 1)
    }
    const levels = Array.from({ length: 10 }, (_, i) => String(i + 1))
    const max = Math.max(1, ...levels.map((l) => counts.get(l) ?? 0))
    return levels.map((level) => ({ level, count: counts.get(level) ?? 0, max }))
  }, [allTracks])

  const boardCounts = useMemo(
    () => boards.map((b) => ({ board: b, count: (columns[b.name] ?? []).length })),
    [boards, columns]
  )

  const rows = useMemo(() => (isLabelField ? groupDuplicates(rawValues) : []), [isLabelField, rawValues])

  const field = category as LabelField

  const previewTracks = useMemo((): Track[] => {
    if (!previewValue || !isLabelField) return []
    return allTracks()
      .filter((t) => t[field] === previewValue)
      .slice(0, 5)
  }, [previewValue, isLabelField, field, allTracks])

  const previewTotal = useMemo(() => {
    if (!previewValue || !isLabelField) return 0
    return allTracks().filter((t) => t[field] === previewValue).length
  }, [previewValue, isLabelField, field, allTracks])

  const doFlash = (msg: string): void => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2500)
  }

  const handleSelectAllTracks = (value: string, valueField: LabelField): void => {
    const ids = allTracks()
      .filter((t) => t[valueField] === value)
      .map((t) => t.id)
    selectTracks(ids)
    setActiveView('List')
  }

  const startRename = (value: string): void => {
    setMenuFor(null)
    setRenaming(value)
    setRenameInput(value)
    setRenameError(null)
  }

  const commitRename = async (oldValue: string): Promise<void> => {
    const trimmed = renameInput.trim()
    if (!trimmed) { setRenameError('Value cannot be empty'); return }
    if (trimmed === oldValue) { setRenaming(null); return }
    const result = await window.api.db.renameLabelValue(field, oldValue, trimmed)
    if (result.ok) {
      setRenaming(null)
      doFlash(`${result.tracksUpdated ?? 0} track${result.tracksUpdated === 1 ? '' : 's'} updated`)
      loadValues(field)
    } else {
      setRenameError(result.error ?? 'Rename failed')
    }
  }

  const confirmMerge = async (fromValue: string, toValue: string): Promise<void> => {
    const result = await window.api.db.renameLabelValue(field, fromValue, toValue)
    setMerging(null)
    setMergeTarget(null)
    if (result.ok) {
      doFlash(`${result.tracksUpdated ?? 0} track${result.tracksUpdated === 1 ? '' : 's'} updated`)
      loadValues(field)
    } else {
      doFlash(`Merge failed: ${result.error ?? 'unknown error'}`)
    }
  }

  const goToBrowse = (value: string): void => {
    if (field === 'genre') setSelectedGenre(value)
    else setSelectedArtist(value)
  }

  const renameCollision = renaming
    ? rawValues.find((r) => r.value !== renaming && r.value.toLowerCase() === renameInput.trim().toLowerCase())
    : undefined

  return (
    <div className="lm-view">
      <div className="lm-categories">
        <div className="lm-panel-title">Label Manager</div>
        {CATEGORIES.map((c) => {
          const count =
            c.id === 'genre' ? genreArtistCounts.genres
            : c.id === 'artist' ? genreArtistCounts.artists
            : c.id === 'board' ? boards.length
            : undefined
          return (
            <div
              key={c.id}
              className={`lm-category-item${category === c.id ? ' active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              <span>{c.label}</span>
              {count != null && <span className="lm-category-count">{count}</span>}
            </div>
          )
        })}
      </div>

      <div className="lm-values">
        {flash && <div className="lm-flash">✓ {flash}</div>}

        {isLabelField && (
          <>
            <div className="lm-values-header">
              {loading ? 'Loading…' : `${rows.length} distinct ${category === 'genre' ? 'genres' : 'artists'}`}
            </div>
            {rows.map((row) => (
              <div key={row.value} className="lm-value-row-wrap">
                {renaming === row.value ? (
                  <div className="lm-rename-row">
                    <input
                      className="ca-input"
                      value={renameInput}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => { setRenameInput(e.target.value); setRenameError(null) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(row.value)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={() => setRenaming(null)}
                    />
                    {renameError ? (
                      <div className="lm-rename-error">{renameError}</div>
                    ) : renameCollision ? (
                      <div className="lm-rename-warning">
                        This will merge {renameCollision.count} track{renameCollision.count === 1 ? '' : 's'} into
                        the existing &quot;{renameCollision.value}&quot;
                      </div>
                    ) : (
                      <div className="lm-rename-hint">Enter to save · Esc to cancel</div>
                    )}
                  </div>
                ) : merging === row.value ? (
                  <div className="lm-merge-row">
                    {mergeTarget ? (
                      <div className="lm-merge-confirm">
                        <span>
                          Merge &quot;{row.value}&quot; ({row.count}) into &quot;{mergeTarget}&quot;? This cannot be undone.
                        </span>
                        <div className="lm-merge-confirm-actions">
                          <button className="btn btn-sm btn-outline" onClick={() => setMergeTarget(null)}>
                            Cancel
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => void confirmMerge(row.value, mergeTarget)}
                          >
                            Merge
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="lm-merge-label">Merge &quot;{row.value}&quot; into…</div>
                        <div className="lm-merge-picker">
                          {rawValues
                            .filter((r) => r.value !== row.value)
                            .map((r) => (
                              <div key={r.value} className="lm-merge-option" onClick={() => setMergeTarget(r.value)}>
                                {r.value} <span className="lm-merge-option-count">{r.count}</span>
                              </div>
                            ))}
                          <div className="lm-merge-cancel" onClick={() => setMerging(null)}>
                            Cancel
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    className={`lm-value-row${previewValue === row.value ? ' active' : ''}`}
                    onClick={() => setPreviewValue(row.value)}
                  >
                    <span className="lm-value-dot" style={{ background: hashColor(row.value) }} />
                    <span className="lm-value-name">{row.value}</span>
                    {row.duplicatesOf && (
                      <span
                        className="lm-dupe-flag"
                        title={`Possible duplicates: ${row.duplicatesOf.join(', ')}`}
                      >
                        ⚠
                      </span>
                    )}
                    <span className="lm-value-count">{row.count}</span>
                    <button
                      className="btn btn-icon btn-ghost lm-value-menu-btn"
                      onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === row.value ? null : row.value) }}
                    >
                      ⋯
                    </button>
                    {menuFor === row.value && (
                      <div className="ctx-menu lm-value-menu" onClick={(e) => e.stopPropagation()}>
                        <div className="ctx-item" onClick={() => startRename(row.value)}>Rename</div>
                        <div className="ctx-item" onClick={() => { setMenuFor(null); setMerging(row.value); setMergeTarget(null) }}>
                          Merge into →
                        </div>
                        <div
                          className="ctx-item"
                          onClick={() => { setMenuFor(null); handleSelectAllTracks(row.value, field) }}
                        >
                          Select all tracks
                        </div>
                      </div>
                    )}
                    {row.duplicatesOf?.map((dup) => (
                      <div key={dup} className="lm-dupe-indent" onClick={(e) => e.stopPropagation()}>
                        {dup}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!loading && rows.length === 0 && (
              <div className="lm-empty">No {category === 'genre' ? 'genres' : 'artists'} tagged yet</div>
            )}
          </>
        )}

        {category === 'energy' && (
          <>
            <div className="lm-values-header">Tracks per energy level</div>
            {energyDistribution.map((e) => (
              <div key={e.level} className="lm-energy-row" onClick={() => setPreviewValue(e.count > 0 ? e.level : null)}>
                <span className="lm-energy-label">E{e.level}</span>
                <div className="lm-energy-bar-track">
                  <div className="lm-energy-bar" style={{ width: `${(e.count / e.max) * 100}%` }} />
                </div>
                <span className="lm-value-count">{e.count}</span>
              </div>
            ))}
          </>
        )}

        {category === 'board' && (
          <>
            <div className="lm-values-header">
              Tracks per board column · manage boards via Toolbar → ⚙ Boards
            </div>
            {boardCounts.map(({ board, count }) => (
              <div key={board.id} className="lm-value-row" onClick={() => setPreviewValue(board.name)}>
                <span className="lm-value-dot" style={{ background: board.color }} />
                <span className="lm-value-name">{board.name}</span>
                <span className="lm-value-count">{count}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="lm-preview">
        {previewValue ? (
          <>
            <div className="lm-panel-title">{previewValue}</div>
            {(category === 'genre' || category === 'artist') && (
              <>
                {previewTracks.map((t) => (
                  <div key={t.id} className="lm-preview-card">
                    <div className="lm-preview-title">{t.title}</div>
                    <div className="lm-preview-artist">{t.artist || '—'}</div>
                    {t.bpm && <span className="tag bpm">{t.bpm}</span>}
                  </div>
                ))}
                {previewTracks.length === 0 && <div className="lm-empty">No tracks found.</div>}
                <div className="lm-preview-viewall" onClick={() => goToBrowse(previewValue)}>
                  View all {previewTotal} track{previewTotal === 1 ? '' : 's'} →
                </div>
              </>
            )}
            {category !== 'genre' && category !== 'artist' && (
              <div className="lm-empty">Preview only available for genres and artists right now.</div>
            )}
          </>
        ) : (
          <div className="lm-empty">Click a value to preview its tracks.</div>
        )}
      </div>
    </div>
  )
}
