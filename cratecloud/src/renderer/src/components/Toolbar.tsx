import { useState, useRef } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { countActiveFilters, type AdvancedFilters } from '../utils/searchFilter'
import { TAG_FIELD_LABELS, type TagField } from '../stores/useTagStore'
import { BoardSettingsModal } from './board/BoardSettingsModal'
import { DuplicatesModal } from './DuplicatesModal'
import { ExportModal } from './ExportModal'
import { LockBadge } from './LockBadge'
import { usePlanLimits } from '../hooks/usePlanLimits'

const VIEWS: { label: string; id: string }[] = [
  { label: '≡ List', id: 'List' },
  { label: '⊞ Board', id: 'Board' },
  { label: '⊟ Grid', id: 'Grid' },
  { label: '⊿ Folders', id: 'Folders' },
  { label: '♫ Albums', id: 'Albums' },
  { label: '# Genres', id: 'Genres' },
]

const HINT_LINES = [
  'Type words to search all fields (AND logic)',
  'bpm:128  or  bpm:120-132',
  'key:8A  ·  energy:7-9',
  'genre:house  ·  artist:kenji',
  'format:flac  ·  year:2023',
  'label:toolroom  ·  remixer:name',
]

const FORMATS = ['MP3', 'FLAC', 'WAV', 'AIFF', 'M4A', 'OGG']

export function Toolbar(): React.JSX.Element {
  const {
    searchQuery, setSearchQuery,
    activeFilter, setActiveFilter,
    advancedFilters, setAdvancedFilter, clearAdvancedFilters,
    activeTagFilters, toggleTagFilter, clearTagFilters,
    activeView, setActiveView,
  } = useLibraryStore()
  const { isLocked } = usePlanLimits()

  const [advOpen, setAdvOpen] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const hintRef = useRef<HTMLDivElement>(null)

  const adv = advancedFilters
  const activeCount = countActiveFilters(adv) + activeTagFilters.length
  const hasUntagged = activeFilter === 'Untagged'

  const setAdv = (key: keyof AdvancedFilters, v: string) => setAdvancedFilter(key, v)

  const clearAll = () => {
    clearAdvancedFilters()
    clearTagFilters()
    setActiveFilter('All')
  }

  // Build active chip descriptors
  const chips: { label: string; onRemove: () => void }[] = []
  if (hasUntagged) chips.push({ label: 'Untagged', onRemove: () => setActiveFilter('All') })
  if (adv.bpmMin || adv.bpmMax) {
    const lo = adv.bpmMin || '…'
    const hi = adv.bpmMax || '…'
    chips.push({ label: `BPM ${lo}–${hi}`, onRemove: () => { setAdv('bpmMin', ''); setAdv('bpmMax', '') } })
  }
  if (adv.energyMin || adv.energyMax) {
    const lo = adv.energyMin || '…'
    const hi = adv.energyMax || '…'
    chips.push({ label: `Energy ${lo}–${hi}`, onRemove: () => { setAdv('energyMin', ''); setAdv('energyMax', '') } })
  }
  if (adv.key) chips.push({ label: `Key: ${adv.key}`, onRemove: () => setAdv('key', '') })
  if (adv.format) chips.push({ label: adv.format.toUpperCase(), onRemove: () => setAdv('format', '') })
  activeTagFilters.forEach((f) => {
    const fieldLabel = TAG_FIELD_LABELS[f.field as TagField] ?? f.field
    chips.push({
      label: `${fieldLabel}: ${f.value}`,
      onRemove: () => toggleTagFilter(f),
    })
  })

  return (
    <div className="toolbar">
      {/* ── Main row ── */}
      <div className="toolbar-main">
        {/* Search box */}
        <div className="search-wrap">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="var(--color-text-disabled)" strokeWidth="1.5" />
            <line x1="11" y1="11" x2="14" y2="14" stroke="var(--color-text-disabled)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search… or use bpm:128, key:8A, genre:house"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')} title="Clear search">✕</button>
          )}
        </div>

        {/* Syntax hint */}
        <div className="search-hint-wrap" ref={hintRef}>
          <button
            className="search-hint-btn"
            onClick={() => setHintOpen((o) => !o)}
            title="Search syntax guide"
          >
            ?
          </button>
          {hintOpen && (
            <div className="search-hint-popup">
              <div className="search-hint-title">Search syntax</div>
              {HINT_LINES.map((line) => (
                <div key={line} className="search-hint-line">{line}</div>
              ))}
            </div>
          )}
        </div>

        {/* Active chips */}
        {chips.map((chip) => (
          <div key={chip.label} className="filter-chip">
            {chip.label}
            <button className="filter-chip-x" onClick={chip.onRemove} title="Remove filter">×</button>
          </div>
        ))}

        {/* Untagged toggle */}
        <button
          className={`btn btn-outline${hasUntagged ? ' btn-active' : ''}`}
          onClick={() => setActiveFilter(hasUntagged ? 'All' : 'Untagged')}
        >
          Untagged
        </button>

        {/* Advanced filter toggle */}
        <button
          className={`btn btn-outline${advOpen || activeCount > 0 ? ' btn-active' : ''}`}
          onClick={() => setAdvOpen((o) => !o)}
          title="Advanced filters"
        >
          ⚙ {activeCount > 0 ? `${activeCount} filter${activeCount > 1 ? 's' : ''}` : 'Filters'}
        </button>

        <div className="view-btns">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`btn btn-outline${activeView === v.id ? ' btn-active' : ''}`}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          className="btn btn-outline"
          onClick={() => setBoardSettingsOpen(true)}
          title="Manage boards & auto-assign rules"
        >
          ⚙ Boards
        </button>

        <LockBadge locked={isLocked('duplicateDetection')} featureName="Duplicate Detection">
          <button
            className="btn btn-outline"
            onClick={() => setDuplicatesOpen(true)}
            title="Scan for possible duplicate tracks"
          >
            ⧉ Duplicates
          </button>
        </LockBadge>

        <button
          className="btn btn-outline"
          onClick={() => setExportOpen(true)}
          title="Export library to Rekordbox XML or Serato M3U playlists"
        >
          ⇩ Export
        </button>
      </div>

      {boardSettingsOpen && <BoardSettingsModal onClose={() => setBoardSettingsOpen(false)} />}
      {duplicatesOpen && <DuplicatesModal onClose={() => setDuplicatesOpen(false)} />}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}

      {/* ── Advanced filter panel ── */}
      {advOpen && (
        <div className="adv-panel">
          <div className="adv-filter-group">
            <span className="adv-filter-label">BPM</span>
            <input
              className="adv-filter-input"
              type="number"
              placeholder="min"
              value={adv.bpmMin}
              onChange={(e) => setAdv('bpmMin', e.target.value)}
            />
            <span className="adv-filter-sep">–</span>
            <input
              className="adv-filter-input"
              type="number"
              placeholder="max"
              value={adv.bpmMax}
              onChange={(e) => setAdv('bpmMax', e.target.value)}
            />
          </div>

          <div className="adv-filter-group">
            <span className="adv-filter-label">Energy</span>
            <input
              className="adv-filter-input"
              type="number"
              placeholder="min"
              min="1"
              max="10"
              value={adv.energyMin}
              onChange={(e) => setAdv('energyMin', e.target.value)}
            />
            <span className="adv-filter-sep">–</span>
            <input
              className="adv-filter-input"
              type="number"
              placeholder="max"
              min="1"
              max="10"
              value={adv.energyMax}
              onChange={(e) => setAdv('energyMax', e.target.value)}
            />
          </div>

          <div className="adv-filter-group">
            <span className="adv-filter-label">Key</span>
            <input
              className="adv-filter-input adv-filter-input-wide"
              placeholder="8A, 11B…"
              value={adv.key}
              onChange={(e) => setAdv('key', e.target.value)}
            />
          </div>

          <div className="adv-filter-group">
            <span className="adv-filter-label">Format</span>
            <select
              className="adv-filter-select"
              value={adv.format}
              onChange={(e) => setAdv('format', e.target.value)}
            >
              <option value="">All</option>
              {FORMATS.map((f) => (
                <option key={f} value={f.toLowerCase()}>{f}</option>
              ))}
            </select>
          </div>

          {(activeCount > 0 || hasUntagged || activeTagFilters.length > 0) && (
            <button className="adv-clear-btn" onClick={clearAll}>
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
