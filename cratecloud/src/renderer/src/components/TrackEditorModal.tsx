import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '../types/track'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useTagStore, type TagField } from '../stores/useTagStore'

function TagSuggestions({ field, currentValue, onSelect }: {
  field: TagField; currentValue: string; onSelect: (v: string) => void
}): React.JSX.Element | null {
  const { tagsForField } = useTagStore()
  const tags = tagsForField(field)
  if (!tags.length) return null
  return (
    <div className="insp-tag-suggestions">
      {tags.map((tag) => {
        const already = currentValue.split('/').map((s) => s.trim()).includes(tag.value)
        return (
          <button
            key={tag.id}
            className={`insp-tag-chip${already ? ' insp-tag-chip-active' : ''}`}
            style={{ borderColor: tag.color, color: tag.color }}
            onClick={() => {
              if (already) return
              const parts = currentValue.split('/').map((s) => s.trim()).filter(Boolean)
              onSelect([...parts, tag.value].join('/'))
            }}
            type="button"
          >
            {tag.value}
          </button>
        )
      })}
    </div>
  )
}

export function TrackEditorModal({ track, onClose }: {
  track: Track
  onClose: () => void
}): React.JSX.Element {
  const { updateTrack, audioPort } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const isThisPlaying = currentTrack?.id === track.id
  const [form, setForm] = useState<Track>({ ...track })
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      if (e.key === 'Escape' || (e.key === 'c' && !inInput)) onClose()
      if (e.key === ' ' && !inInput) { e.preventDefault(); togglePlayPause() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, togglePlayPause])

  const set = (field: keyof Track, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
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
        const r = await window.api.editTags(form.filepath, meta, true)
        if (r.success) {
          setSaveNote(r.serato_written ? 'Saved · Serato updated' : 'Saved')
          setSaving(false)
          setTimeout(onClose, 700)
          return
        }
        setSaveNote(`Error: ${r.error}`)
      } catch (err) {
        setSaveNote(`Error: ${String(err)}`)
      }
    } else {
      setSaving(false)
      setTimeout(onClose, 700)
      return
    }
    setSaving(false)
  }

  const handleArtworkUpload = async () => {
    const saved = await window.api.artwork.pick(track.filepath ?? String(track.id))
    if (saved) {
      updateTrack(track.id, { artwork_path: saved } as Partial<Track>)
      if (audioPort) setArtworkSrc(`http://127.0.0.1:${audioPort}${saved}?t=${Date.now()}`)
    }
  }

  return createPortal(
    <div className="ted-backdrop" onClick={onClose}>
      <div className="ted-panel" onClick={(e) => e.stopPropagation()}>
        {/* ── header ── */}
        <div className="ted-header">
          <div className="ted-art-wrap" onClick={handleArtworkUpload} title="Click to change artwork">
            {artworkSrc
              ? <img className="ted-art" src={artworkSrc} onError={() => setArtworkSrc(undefined)} draggable={false} />
              : <div className="ted-art-empty">♪</div>
            }
            <div className="ted-art-overlay">Change</div>
          </div>
          <div className="ted-title-block">
            <div className="ted-track-title">{form.title}</div>
            <div className="ted-track-artist">{form.artist || '—'}</div>
          </div>
          <button
            className={`ted-play-btn${isThisPlaying ? ' playing' : ''}`}
            onClick={() => isThisPlaying ? togglePlayPause() : track.filepath && playTrack(track)}
            title={isThisPlaying ? (isPlaying ? 'Pause' : 'Resume') : 'Play'}
            type="button"
          >
            {isThisPlaying && isPlaying ? '⏸' : '▶'}
          </button>
          <button className="ted-close" onClick={onClose} title="Close (C)" type="button">✕</button>
        </div>

        {/* ── form body ── */}
        <div className="ted-body">
          <div className="ca-field">
            <div className="ca-label">Title</div>
            <input className="ca-input" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Artist</div>
            <input className="ca-input" value={form.artist} onChange={(e) => set('artist', e.target.value)} />
          </div>
          <div className="ca-row">
            <div className="ca-field">
              <div className="ca-label">BPM</div>
              <input className="ca-input" value={form.bpm} placeholder="—" onChange={(e) => set('bpm', e.target.value)} />
            </div>
            <div className="ca-field">
              <div className="ca-label">Key</div>
              <input className="ca-input" value={form.key} placeholder="—" onChange={(e) => set('key', e.target.value)} />
            </div>
          </div>
          <div className="ca-field">
            <div className="ca-label">Genre</div>
            <input className="ca-input" value={form.genre} placeholder="—" onChange={(e) => set('genre', e.target.value)} />
            <TagSuggestions field="genre" currentValue={form.genre ?? ''} onSelect={(v) => set('genre', v)} />
          </div>
          <div className="ca-row">
            <div className="ca-field">
              <div className="ca-label">Energy</div>
              <input className="ca-input" value={form.energy} placeholder="—" onChange={(e) => set('energy', e.target.value)} />
            </div>
            <div className="ca-field">
              <div className="ca-label">Year</div>
              <input className="ca-input" value={form.year ?? ''} placeholder="—" onChange={(e) => set('year', e.target.value)} />
            </div>
          </div>
          <div className="ca-field">
            <div className="ca-label">Album</div>
            <input className="ca-input" value={form.album ?? ''} placeholder="—" onChange={(e) => set('album', e.target.value)} />
          </div>

          <div className="ca-divider" />

          <div className="ca-field">
            <div className="ca-label">Remixer</div>
            <input className="ca-input" value={form.remixer ?? ''} placeholder="—" onChange={(e) => set('remixer', e.target.value)} />
            <TagSuggestions field="remixer" currentValue={form.remixer ?? ''} onSelect={(v) => set('remixer', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Label</div>
            <input className="ca-input" value={form.label ?? ''} placeholder="—" onChange={(e) => set('label', e.target.value)} />
            <TagSuggestions field="label" currentValue={form.label ?? ''} onSelect={(v) => set('label', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Grouping</div>
            <input className="ca-input" value={form.grouping ?? ''} placeholder="—" onChange={(e) => set('grouping', e.target.value)} />
            <TagSuggestions field="grouping" currentValue={form.grouping ?? ''} onSelect={(v) => set('grouping', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Composer</div>
            <input className="ca-input" value={form.composer ?? ''} placeholder="—" onChange={(e) => set('composer', e.target.value)} />
            <TagSuggestions field="composer" currentValue={form.composer ?? ''} onSelect={(v) => set('composer', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Comment</div>
            <input className="ca-input" value={form.comment ?? ''} placeholder="—" onChange={(e) => set('comment', e.target.value)} />
            <TagSuggestions field="comment" currentValue={form.comment ?? ''} onSelect={(v) => set('comment', v)} />
          </div>

          <div className="ca-divider" />

          <div className="ca-meta">
            {track.duration_str && <span>{track.duration_str}</span>}
            {track.format && <span>{track.format}</span>}
            {track.file_size_mb != null && <span>{track.file_size_mb} MB</span>}
          </div>

          {saveNote && <div className="ca-save-note">{saveNote}</div>}

          <button className="ca-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
