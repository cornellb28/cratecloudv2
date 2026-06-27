import { useState, useEffect } from 'react'
import type { Track } from '../types/track'
import { useLibraryStore } from '../stores/useLibraryStore'

const PLACEHOLDER_WAVE = [8, 14, 20, 28, 22, 35, 28, 20, 33, 26, 18, 30, 24, 16, 34, 28, 22, 36, 30, 18, 25, 32, 20, 14, 28, 22, 16, 30, 24, 18]
const AI_MATCHES = [
  { label: 'Solar Apex — Kenji Rō', pct: 94 },
  { label: 'Neon Griot — Asa Oke', pct: 87 },
  { label: 'Afterglow — Pari S', pct: 81 },
]

function WaveformPreview({ waveform }: { waveform?: number[] }): React.JSX.Element {
  const points = waveform
    ? Array.from({ length: 30 }, (_, i) => waveform[Math.floor((i * waveform.length) / 30)] ?? 0)
    : PLACEHOLDER_WAVE
  const max = Math.max(...points, 0.01)

  return (
    <div className="waveform">
      {points.map((h, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{ height: `${Math.max(2, Math.round((h / max) * 34))}px` }}
        />
      ))}
    </div>
  )
}

export function Inspector(): React.JSX.Element {
  const { activeTrack, activeTrackCol, setActiveTrack, updateTrack } = useLibraryStore()
  const [form, setForm] = useState<Track | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)

  useEffect(() => {
    if (activeTrack) {
      setForm({ ...activeTrack })
      setSaveNote(null)
    }
  }, [activeTrack?.id])

  const handleChange = (field: keyof Track, value: string) => {
    if (!form) return
    setForm({ ...form, [field]: value })
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setSaveNote(null)

    updateTrack(form.id, form)

    if (form.filepath) {
      try {
        const meta: Record<string, string | undefined> = {
          title: form.title || undefined,
          artist: form.artist || undefined,
          album: form.album || undefined,
          genre: form.genre || undefined,
          bpm: form.bpm || undefined,
          key: form.key || undefined,
          year: form.year || undefined,
          remixer: form.remixer || undefined,
          grouping: form.grouping || undefined,
          composer: form.composer || undefined,
          comment: form.comment || undefined,
          label: form.label || undefined,
        }
        const result = await window.api.editTags(form.filepath, meta, true)
        if (!result.success) {
          setSaveNote(`File error: ${result.error}`)
        } else if (result.serato_written) {
          setSaveNote('Saved · Serato updated')
        } else {
          setSaveNote('Saved to file')
        }
      } catch (err) {
        setSaveNote(`File error: ${String(err)}`)
      }
    } else {
      setSaveNote('Saved to library')
    }

    setSaving(false)
    setActiveTrack(null, null)
    setTimeout(() => setSaveNote(null), 2500)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        {activeTrack ? `Inspector — ${activeTrackCol}` : 'Track inspector'}
      </div>

      <div className="panel-body">
        {saveNote && !activeTrack && (
          <div className="panel-saved">✓ {saveNote}</div>
        )}

        {!activeTrack && !saveNote && (
          <div className="panel-empty">
            Click any track<br />to inspect &amp; edit
          </div>
        )}

        {activeTrack && form && (
          <>
            <div>
              <div className="field-label">Title</div>
              <input
                className="field-input"
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Artist</div>
              <input
                className="field-input"
                value={form.artist}
                onChange={(e) => handleChange('artist', e.target.value)}
              />
            </div>

            <div className="field-row">
              <div>
                <div className="field-label">BPM</div>
                <input
                  className="field-input"
                  value={form.bpm}
                  placeholder="—"
                  onChange={(e) => handleChange('bpm', e.target.value)}
                />
              </div>
              <div>
                <div className="field-label">Key</div>
                <input
                  className="field-input"
                  value={form.key}
                  placeholder="—"
                  onChange={(e) => handleChange('key', e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="field-label">Genre</div>
              <input
                className="field-input"
                value={form.genre}
                placeholder="—"
                onChange={(e) => handleChange('genre', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Energy (1–10)</div>
              <input
                className="field-input"
                value={form.energy}
                placeholder="—"
                onChange={(e) => handleChange('energy', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Album</div>
              <input
                className="field-input"
                value={form.album ?? ''}
                placeholder="—"
                onChange={(e) => handleChange('album', e.target.value)}
              />
            </div>

            <div className="field-row">
              <div>
                <div className="field-label">Year</div>
                <input
                  className="field-input"
                  value={form.year ?? ''}
                  placeholder="—"
                  onChange={(e) => handleChange('year', e.target.value)}
                />
              </div>
              <div>
                <div className="field-label">Format</div>
                <input
                  className="field-input"
                  value={form.format ?? ''}
                  placeholder="—"
                  readOnly
                  style={{ opacity: 0.6, cursor: 'default' }}
                />
              </div>
            </div>

            <div>
              <div className="field-label">Remixer</div>
              <input
                className="field-input"
                value={form.remixer ?? ''}
                placeholder="—"
                onChange={(e) => handleChange('remixer', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Grouping</div>
              <input
                className="field-input"
                value={form.grouping ?? ''}
                placeholder="—"
                onChange={(e) => handleChange('grouping', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Composer</div>
              <input
                className="field-input"
                value={form.composer ?? ''}
                placeholder="—"
                onChange={(e) => handleChange('composer', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Label</div>
              <input
                className="field-input"
                value={form.label ?? ''}
                placeholder="—"
                onChange={(e) => handleChange('label', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Comment</div>
              <input
                className="field-input"
                value={form.comment ?? ''}
                placeholder="—"
                onChange={(e) => handleChange('comment', e.target.value)}
              />
            </div>

            <div>
              <div className="field-label">Waveform preview</div>
              <WaveformPreview waveform={activeTrack.waveform} />
            </div>

            {/* Read-only file metadata */}
            <div className="insp-tags-section">
              <div className="insp-tags-title">File tags</div>
              <div className="insp-tags-grid">
                <span className="insp-tag-key">Duration</span>
                <span className="insp-tag-val">{activeTrack.duration_str ?? '—'}</span>

                <span className="insp-tag-key">Size</span>
                <span className="insp-tag-val">
                  {activeTrack.file_size_mb != null ? `${activeTrack.file_size_mb} MB` : '—'}
                </span>

                <span className="insp-tag-key">Camelot</span>
                <span className="insp-tag-val">{activeTrack.camelot ?? '—'}</span>

                <span className="insp-tag-key">Open Key</span>
                <span className="insp-tag-val">{activeTrack.openkey ?? '—'}</span>

                {activeTrack.filepath && (
                  <>
                    <span className="insp-tag-key">File</span>
                    <span
                      className="insp-tag-val insp-tag-path"
                      title={activeTrack.filepath}
                    >
                      {activeTrack.filepath.split('/').pop()}
                    </span>

                    <span className="insp-tag-key">Folder</span>
                    <span className="insp-tag-val insp-tag-path" title={activeTrack.filepath}>
                      {activeTrack.filepath.split('/').slice(0, -1).join('/').split('/').pop() ?? '—'}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="ai-chip">
              <div className="ai-label">✦ AI harmonic matches</div>
              {AI_MATCHES.map((m) => (
                <div key={m.label} className="ai-match">
                  <span>{m.label}</span>
                  <span className="ai-pct">{m.pct}%</span>
                </div>
              ))}
            </div>

            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
