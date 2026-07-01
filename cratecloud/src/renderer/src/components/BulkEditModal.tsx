import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useTagStore, TAG_FIELDS, TAG_FIELD_LABELS, type TagField } from '../stores/useTagStore'
import type { Track } from '../types/track'

type BulkField = 'genre' | 'energy' | 'bpm' | 'key' | 'year' | 'label' | 'comment' | 'remixer'

const BULK_FIELDS: { key: BulkField; label: string; wide?: boolean }[] = [
  { key: 'genre', label: 'Genre' },
  { key: 'energy', label: 'Energy' },
  { key: 'bpm', label: 'BPM' },
  { key: 'key', label: 'Key' },
  { key: 'year', label: 'Year' },
  { key: 'label', label: 'Label' },
  { key: 'remixer', label: 'Remixer' },
  { key: 'comment', label: 'Comment', wide: true },
]

export function BulkEditModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { selected, allTracks, updateTrack } = useLibraryStore()
  const { tagsForField } = useTagStore()

  const [fields, setFields] = useState<Partial<Record<BulkField, string>>>({})
  const [fillEmpty, setFillEmpty] = useState(false)
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null)

  const tracks = allTracks().filter((t) => selected.has(t.id))
  const n = tracks.length

  const flash = (msg: string) => {
    setAppliedMsg(msg)
    setTimeout(() => setAppliedMsg(null), 1800)
  }

  const applyTag = (field: TagField, value: string) => {
    tracks.forEach((track) => {
      const current = track[field as keyof Track] as string | undefined
      const parts = (current ?? '').split('/').map((s) => s.trim()).filter(Boolean)
      if (!parts.includes(value)) {
        updateTrack(track.id, { [field]: [...parts, value].join('/') })
      }
    })
    flash(`"${value}" applied to ${n} track${n !== 1 ? 's' : ''}`)
  }

  const handleApply = () => {
    const updates = (Object.entries(fields) as [BulkField, string][]).filter(([, v]) => (v ?? '').trim() !== '')
    if (!updates.length) { onClose(); return }

    tracks.forEach((track) => {
      const patch: Partial<Track> = {}
      updates.forEach(([key, value]) => {
        if (fillEmpty) {
          const existing = track[key as keyof Track] as string | undefined
          if (!existing) (patch as Record<string, string>)[key] = value
        } else {
          (patch as Record<string, string>)[key] = value
        }
      })
      if (Object.keys(patch).length) updateTrack(track.id, patch)
    })
    onClose()
  }

  const tagFieldsWithTags = TAG_FIELDS.filter((f) => tagsForField(f).length > 0)

  return createPortal(
    <div className="ted-backdrop" onClick={onClose}>
      <div className="bem-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bem-header">
          <span className="bem-title">Edit {n} track{n !== 1 ? 's' : ''}</span>
          <button className="ted-close" onClick={onClose} type="button">✕</button>
        </div>

        {tagFieldsWithTags.length > 0 && (
          <div className="bem-section">
            <div className="bem-section-label">Apply tags to all selected</div>
            {tagFieldsWithTags.map((field) => (
              <div key={field} className="bem-tag-row">
                <span className="bem-tag-field">{TAG_FIELD_LABELS[field]}</span>
                <div className="bem-tag-chips">
                  {tagsForField(field).map((tag) => (
                    <button
                      key={tag.id}
                      className="bem-chip"
                      style={{ borderColor: tag.color, color: tag.color }}
                      onClick={() => applyTag(field, tag.value)}
                      title={`Add "${tag.value}" to all ${n} selected tracks`}
                      type="button"
                    >
                      {tag.value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {appliedMsg && <div className="bem-saved">✓ {appliedMsg}</div>}
          </div>
        )}

        <div className="bem-section">
          <div className="bem-section-label">Set field values — blank fields are skipped</div>
          <div className="bem-fields-grid">
            {BULK_FIELDS.map(({ key, label, wide }) => (
              <div key={key} className={`bem-field${wide ? ' wide' : ''}`}>
                <label className="bem-field-label">{label}</label>
                <input
                  className="bem-field-input"
                  placeholder="—"
                  value={fields[key] ?? ''}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <label className="bem-toggle">
            <input
              type="checkbox"
              checked={fillEmpty}
              onChange={(e) => setFillEmpty(e.target.checked)}
            />
            Only fill empty fields (skip tracks that already have a value)
          </label>
        </div>

        <div className="bem-footer">
          <button className="bem-btn" onClick={onClose} type="button">Cancel</button>
          <button className="bem-btn primary" onClick={handleApply} type="button">
            Apply to {n} track{n !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
