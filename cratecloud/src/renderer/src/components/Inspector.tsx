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
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (activeTrack) {
      setForm({ ...activeTrack })
      setSaved(false)
    }
  }, [activeTrack?.id])

  const handleChange = (field: keyof Track, value: string) => {
    if (!form) return
    setForm({ ...form, [field]: value })
  }

  const handleSave = () => {
    if (!form) return
    updateTrack(form.id, form)
    setActiveTrack(null, null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        {activeTrack ? `Inspector — ${activeTrackCol}` : 'Track inspector'}
      </div>

      <div className="panel-body">
        {saved && !activeTrack && (
          <div className="panel-saved">✓ Saved to library</div>
        )}

        {!activeTrack && !saved && (
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
              <div className="field-label">Waveform preview</div>
              <WaveformPreview waveform={activeTrack.waveform} />
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

            <button className="save-btn" onClick={handleSave}>Save changes</button>
          </>
        )}
      </div>
    </div>
  )
}
