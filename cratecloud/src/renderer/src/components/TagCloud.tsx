import { useState, useRef, useEffect } from 'react'
import { useTagStore, TAG_FIELDS, TAG_FIELD_LABELS, type TagField } from '../stores/useTagStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { CRATE_COLORS } from '../types/track'

type TagMenu = { id: number; x: number; y: number } | null

const DEFAULT_COLOR = CRATE_COLORS[0]

export function TagCloud(): React.JSX.Element {
  const { tags, tagsForField, addTag, removeTag } = useTagStore()
  const { activeTrack, selected, updateTrack, allTracks, activeTagFilters, toggleTagFilter } = useLibraryStore()

  const [expanded, setExpanded] = useState<Set<TagField>>(new Set())
  const [adding, setAdding] = useState<TagField | null>(null)
  const [newValue, setNewValue] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)
  const [tagMenu, setTagMenu] = useState<TagMenu>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagMenu) return
    const dismiss = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setTagMenu(null)
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [tagMenu])

  const toggleField = (field: TagField) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
        if (adding === field) { setAdding(null); setNewValue('') }
      } else {
        next.add(field)
      }
      return next
    })
  }

  const appendTag = (current: string | undefined, value: string): string => {
    if (!current) return value
    const parts = current.split('/').map((s) => s.trim()).filter(Boolean)
    if (parts.includes(value)) return current
    return [...parts, value].join('/')
  }

  const applyTag = (field: TagField, value: string) => {
    const selIds = [...selected]
    if (selIds.length > 0) {
      const tracks = allTracks()
      selIds.forEach((id) => {
        const track = tracks.find((t) => t.id === id)
        if (track) {
          const current = track[field as keyof typeof track] as string | undefined
          updateTrack(id, { [field]: appendTag(current, value) })
        }
      })
    } else if (activeTrack) {
      const current = activeTrack[field as keyof typeof activeTrack] as string | undefined
      updateTrack(activeTrack.id, { [field]: appendTag(current, value) })
    }
  }

  const startAdding = (e: React.MouseEvent, field: TagField) => {
    e.stopPropagation()
    if (!expanded.has(field)) {
      setExpanded((prev) => new Set([...prev, field]))
    }
    setAdding(field)
    setNewValue('')
    setNewColor(DEFAULT_COLOR)
  }

  const submitAdd = async () => {
    if (!adding || !newValue.trim()) {
      setAdding(null)
      setNewValue('')
      return
    }
    await addTag(adding, newValue.trim(), newColor)
    setNewValue('')
    setAdding(null)
  }

  // Filter mode: no track selected or active → clicking a chip toggles a library filter
  const filterMode = selected.size === 0 && !activeTrack
  const canApply = selected.size > 0 || !!activeTrack

  const applyHint = selected.size > 0
    ? `Apply to ${selected.size} selected track${selected.size > 1 ? 's' : ''}`
    : activeTrack
      ? `Apply to "${activeTrack.title}"`
      : ''

  const handleChipClick = (field: TagField, id: number, value: string) => {
    if (filterMode) {
      toggleTagFilter({ id, field, value })
    } else {
      applyTag(field, value)
    }
  }

  const isActiveFilter = (id: number) => activeTagFilters.some((f) => f.id === id)

  const allExpanded = TAG_FIELDS.every((f) => expanded.has(f))

  return (
    <div className="tag-cloud">
      <div className="sb-section-row">
        <span className="sb-section">Tags</span>
        <button
          className="tc-toggle-all"
          onClick={() => setExpanded(allExpanded ? new Set() : new Set(TAG_FIELDS))}
          title={allExpanded ? 'Collapse all' : 'Expand all'}
        >
          {allExpanded ? '−' : '+'}
        </button>
      </div>

      {/* Mode hint */}
      {tags.length > 0 && (
        <div className="tc-mode-hint">
          {filterMode
            ? activeTagFilters.length > 0
              ? `Filtering by ${activeTagFilters.length} tag${activeTagFilters.length > 1 ? 's' : ''} — click to remove`
              : 'Click a tag to filter library'
            : applyHint
          }
        </div>
      )}

      {tags.length === 0 && !TAG_FIELDS.some((f) => expanded.has(f)) && (
        <div className="sb-empty">No tags yet — expand a field to create one</div>
      )}

      {TAG_FIELDS.map((field) => {
        const fieldTags = tagsForField(field)
        const isExpanded = expanded.has(field)

        return (
          <div key={field} className="tc-field">
            <div className="tc-field-header" onClick={() => toggleField(field)}>
              <span className="tc-chevron">{isExpanded ? '▾' : '▸'}</span>
              <span className="tc-field-label">{TAG_FIELD_LABELS[field]}</span>
              {fieldTags.length > 0 && (
                <span className="tc-field-count">{fieldTags.length}</span>
              )}
              <button
                className="sb-add-btn"
                onClick={(e) => startAdding(e, field)}
                title={`New ${TAG_FIELD_LABELS[field]} tag`}
              >
                +
              </button>
            </div>

            {isExpanded && (
              <>
                {fieldTags.length > 0 && (
                  <div className="tc-chips">
                    {fieldTags.map((tag) => {
                      const active = isActiveFilter(tag.id)
                      return (
                        <div
                          key={tag.id}
                          className={[
                            'tc-chip',
                            !canApply && !filterMode ? 'tc-chip-dim' : '',
                            active ? 'tc-chip-filter-on' : '',
                          ].filter(Boolean).join(' ')}
                          style={{
                            borderColor: tag.color,
                            color: active ? '#fff' : tag.color,
                            background: active ? tag.color + '44' : 'none',
                          }}
                          onClick={() => handleChipClick(field, tag.id, tag.value)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setTagMenu({ id: tag.id, x: e.clientX, y: e.clientY })
                          }}
                          title={
                            filterMode
                              ? active
                                ? `Remove "${tag.value}" filter`
                                : `Filter library by "${tag.value}"`
                              : canApply
                                ? applyHint
                                : 'Select a track to apply this tag'
                          }
                        >
                          {active && <span className="tc-chip-filter-icon">⊛ </span>}
                          {tag.value}
                        </div>
                      )
                    })}
                  </div>
                )}

                {fieldTags.length === 0 && adding !== field && (
                  <div className="tc-chips">
                    <span className="tc-empty">No tags yet</span>
                  </div>
                )}

                {adding === field && (
                  <div className="tc-add-form">
                    <input
                      autoFocus
                      className="tc-add-input"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder={`${TAG_FIELD_LABELS[field]} tag name…`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitAdd()
                        if (e.key === 'Escape') { setAdding(null); setNewValue('') }
                      }}
                    />
                    <div className="tc-add-colors">
                      {CRATE_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`tc-color-swatch${newColor === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setNewColor(c)}
                          title={c}
                        />
                      ))}
                    </div>
                    <div className="tc-add-actions">
                      <button
                        className="tc-btn"
                        onClick={() => { setAdding(null); setNewValue('') }}
                      >
                        Cancel
                      </button>
                      <button className="tc-btn tc-btn-primary" onClick={submitAdd}>
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {tagMenu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ position: 'fixed', left: tagMenu.x, top: tagMenu.y }}
        >
          <div
            className="ctx-item ctx-danger"
            onClick={() => { removeTag(tagMenu.id); setTagMenu(null) }}
          >
            Delete tag
          </div>
        </div>
      )}
    </div>
  )
}
