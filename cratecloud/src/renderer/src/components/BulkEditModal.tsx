import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useTagStore, TAG_FIELDS, TAG_FIELD_LABELS, type TagField } from '../stores/useTagStore'
import type { Track } from '../types/track'
import { ArtistInput } from './ArtistInput'
import { TagInput } from './TagInput'
import { CamelotKeyPicker } from './CamelotKeyPicker'

type BulkField =
  | 'bpm' | 'key' | 'genre' | 'artist' | 'energy' | 'album' | 'year'
  | 'label' | 'remixer' | 'comment'

type Control = 'text' | 'tag' | 'artist' | 'key' | 'energy'

const BULK_FIELDS: { key: BulkField; label: string; control: Control; wide?: boolean }[] = [
  { key: 'bpm', label: 'BPM', control: 'text' },
  { key: 'key', label: 'Key', control: 'key' },
  { key: 'genre', label: 'Genre', control: 'tag' },
  { key: 'artist', label: 'Artist', control: 'artist' },
  { key: 'energy', label: 'Energy', control: 'energy' },
  { key: 'album', label: 'Album', control: 'text' },
  { key: 'year', label: 'Year', control: 'text' },
  { key: 'label', label: 'Label', control: 'tag' },
  { key: 'remixer', label: 'Remixer', control: 'tag' },
  { key: 'comment', label: 'Comment', control: 'tag', wide: true },
]

// MOBILE TODO: Modal becomes a full-screen bottom sheet.
// Field list is scrollable. Save button is sticky at bottom.
export function BulkEditModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { selected, allTracks, updateTrack } = useLibraryStore()
  const { tagsForField } = useTagStore()

  const [draft, setDraft] = useState<Partial<Record<BulkField, string>>>({})
  const [enabled, setEnabled] = useState<Partial<Record<BulkField, boolean>>>({})
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null)

  const tracks = allTracks().filter((t) => selected.has(t.id))
  const n = tracks.length

  const flash = (msg: string) => {
    setAppliedMsg(msg)
    setTimeout(() => setAppliedMsg(null), 1800)
  }

  const setFieldValue = (key: BulkField) => (v: string): void =>
    setDraft((f) => ({ ...f, [key]: v }))

  const toggleEnabled = (key: BulkField, checked: boolean): void => {
    setEnabled((s) => ({ ...s, [key]: checked }))
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

  const activeFields = (Object.keys(enabled) as BulkField[]).filter((k) => enabled[k])

  const handleApply = (): void => {
    if (!activeFields.length) { onClose(); return }

    tracks.forEach((track) => {
      const patch: Partial<Track> = {}
      activeFields.forEach((key) => {
        (patch as Record<string, string>)[key] = draft[key] ?? ''
      })
      updateTrack(track.id, patch)
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
          <div className="bem-section-label">
            Editing {n} track{n !== 1 ? 's' : ''} — only checked fields will be saved
          </div>
          <div className="bem-fields-grid">
            {BULK_FIELDS.map(({ key, label, control, wide }) => {
              const isEnabled = !!enabled[key]
              const value = draft[key] ?? ''
              return (
                <div key={key} className={`bem-field${wide ? ' wide' : ''}${isEnabled ? ' bem-field-enabled' : ''}`}>
                  <label className="bem-field-check">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => toggleEnabled(key, e.target.checked)}
                    />
                    {label}
                  </label>
                  {control === 'text' && (
                    <input
                      className="bem-field-input"
                      placeholder="—"
                      value={value}
                      disabled={!isEnabled}
                      onChange={(e) => setFieldValue(key)(e.target.value)}
                    />
                  )}
                  {control === 'tag' && (
                    <TagInput field={key as TagField} value={value} onChange={setFieldValue(key)} />
                  )}
                  {control === 'artist' && (
                    <ArtistInput value={value} onChange={setFieldValue(key)} onCommit={setFieldValue(key)} />
                  )}
                  {control === 'key' && (
                    <CamelotKeyPicker value={value} onChange={setFieldValue(key)} />
                  )}
                  {control === 'energy' && (
                    <div className="bem-energy-row">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={value ? parseInt(value, 10) : 5}
                        disabled={!isEnabled}
                        onChange={(e) => setFieldValue(key)(e.target.value)}
                        className="bem-energy-slider"
                      />
                      <span className="bem-energy-value">{value || '—'}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bem-footer">
          <button className="btn btn-outline" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-solid" onClick={handleApply} type="button">
            Apply to {n} track{n !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
