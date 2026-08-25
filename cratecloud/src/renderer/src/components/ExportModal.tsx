import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { Track } from '../types/track'

type Props = { onClose: () => void }
type Format = 'rekordbox' | 'serato'
type Scope = 'all' | 'crates'
type ExportOutcome = { type: 'success'; path: string } | { type: 'error'; message: string }

function parseExportNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

function hasFilepath(t: Track): t is Track & { filepath: string } {
  return !!t.filepath
}

// Track.bpm/energy are strings and Track has camelot/openkey (not
// key_camelot/key_openkey) — this is the mapping agreed on when the
// ExportTrack/ExportCrate type mismatch was flagged during planning.
function toExportTrack(t: Track & { filepath: string }): {
  id: number
  filepath: string
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  bpm: number | null
  key_camelot: string | null
  key_openkey: string | null
  energy: number | null
  duration_sec: number | null
} {
  return {
    id: t.id,
    filepath: t.filepath,
    title: t.title || null,
    artist: t.artist || null,
    album: t.album || null,
    genre: t.genre || null,
    bpm: parseExportNumber(t.bpm),
    key_camelot: t.camelot || null,
    key_openkey: t.openkey || null,
    energy: parseExportNumber(t.energy),
    duration_sec: t.duration_sec ?? null,
  }
}

export function ExportModal({ onClose }: Props): React.JSX.Element {
  const { allTracks, crates } = useLibraryStore()
  const tracks = allTracks()

  const [format, setFormat] = useState<Format>('rekordbox')
  const [scope, setScope] = useState<Scope>('all')
  const [selectedCrateIds, setSelectedCrateIds] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null)

  // Tracks with no on-disk path can't be referenced by either format, so
  // they're excluded from every count/selection below — mirrors the same
  // filepath-required convention already used by getSetlistFilepaths in db.ts.
  const exportableTracks = useMemo(() => tracks.filter(hasFilepath), [tracks])

  const toggleCrate = (id: number): void => {
    setSelectedCrateIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { exportTracks, exportCrates } = useMemo(() => {
    if (scope === 'all') {
      const exportableIdSet = new Set(exportableTracks.map((t) => t.id))
      return {
        exportTracks: exportableTracks.map(toExportTrack),
        exportCrates: crates.map((c) => ({
          id: c.id,
          name: c.name,
          trackIds: [...c.trackIds].filter((id) => exportableIdSet.has(id)),
        })),
      }
    }

    const chosen = crates.filter((c) => selectedCrateIds.has(c.id))
    const includedIds = new Set<number>()
    chosen.forEach((c) => c.trackIds.forEach((id) => includedIds.add(id)))
    const filteredTracks = exportableTracks.filter((t) => includedIds.has(t.id))
    const filteredIdSet = new Set(filteredTracks.map((t) => t.id))
    return {
      exportTracks: filteredTracks.map(toExportTrack),
      exportCrates: chosen.map((c) => ({
        id: c.id,
        name: c.name,
        trackIds: [...c.trackIds].filter((id) => filteredIdSet.has(id)),
      })),
    }
  }, [scope, selectedCrateIds, exportableTracks, crates])

  const formatLabel = format === 'rekordbox' ? 'Rekordbox XML' : 'Serato M3U'
  const summaryText = `Exporting ${exportTracks.length} track${exportTracks.length !== 1 ? 's' : ''} across ${exportCrates.length} crate${exportCrates.length !== 1 ? 's' : ''} as ${formatLabel}`

  const exportDisabled =
    exporting || exportTracks.length === 0 || (scope === 'crates' && selectedCrateIds.size === 0)

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    setOutcome(null)
    try {
      const payload = { tracks: exportTracks, crates: exportCrates }
      const res =
        format === 'rekordbox'
          ? await window.api.export.rekordbox(payload)
          : await window.api.export.serato(payload)
      if (res.canceled) {
        // DJ backed out of the save/folder dialog — not an error, no banner
      } else if (res.ok) {
        setOutcome({ type: 'success', path: res.path ?? '' })
      } else {
        setOutcome({ type: 'error', message: res.error ?? 'Export failed' })
      }
    } catch (err) {
      setOutcome({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setExporting(false)
    }
  }

  return createPortal(
    <div className="ted-backdrop" onClick={onClose}>
      <div className="bem-panel exp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bem-header">
          <span className="bem-title">Export library</span>
          <button className="ted-close" onClick={onClose} type="button">✕</button>
        </div>

        <div className="bem-section">
          <div className="bem-section-label">Format</div>
          <div className="exp-format-grid">
            <button
              type="button"
              className={`exp-format-card${format === 'rekordbox' ? ' selected' : ''}`}
              onClick={() => setFormat('rekordbox')}
            >
              <div className="exp-format-title">Rekordbox XML</div>
              <div className="exp-format-desc">For Pioneer CDJs, XDJ, and rekordbox desktop software</div>
            </button>
            <button
              type="button"
              className={`exp-format-card${format === 'serato' ? ' selected' : ''}`}
              onClick={() => setFormat('serato')}
            >
              <div className="exp-format-title">Serato M3U</div>
              <div className="exp-format-desc">For Serato DJ, import via File → Import</div>
            </button>
          </div>
        </div>

        <div className="bem-section">
          <div className="bem-section-label">What to export</div>
          <label className="exp-scope-option">
            <input type="radio" name="exp-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
            Entire library ({exportableTracks.length} tracks)
          </label>
          <label className="exp-scope-option">
            <input type="radio" name="exp-scope" checked={scope === 'crates'} onChange={() => setScope('crates')} />
            Selected crates
          </label>

          {scope === 'crates' && (
            <div className="exp-crate-list">
              {crates.length === 0 && <div className="exp-crate-empty">No crates yet.</div>}
              {crates.map((c) => (
                <label key={c.id} className="exp-crate-row">
                  <input
                    type="checkbox"
                    checked={selectedCrateIds.has(c.id)}
                    onChange={() => toggleCrate(c.id)}
                  />
                  <span className="exp-crate-swatch" style={{ background: c.color }} />
                  <span className="exp-crate-name">{c.name}</span>
                  <span className="exp-crate-count">{c.trackIds.size} tracks</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="bem-section exp-summary-section">
          <div className="exp-summary">{summaryText}</div>
        </div>

        {outcome?.type === 'success' && (
          <div className="exp-banner success">
            <span>Exported to {outcome.path}</span>
            <button className="exp-banner-dismiss" onClick={() => setOutcome(null)} type="button">✕</button>
          </div>
        )}
        {outcome?.type === 'error' && (
          <div className="exp-banner error">
            <span>{outcome.message} — try again</span>
            <button className="exp-banner-dismiss" onClick={() => setOutcome(null)} type="button">✕</button>
          </div>
        )}

        <div className="bem-footer">
          <button className="btn btn-outline" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-solid" onClick={handleExport} disabled={exportDisabled} type="button">
            {exporting ? (<><span className="exp-spinner" />Exporting...</>) : 'Export →'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
