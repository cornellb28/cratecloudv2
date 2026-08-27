import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '../types/track'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { TagInput } from './TagInput'
import { ArtistInput } from './ArtistInput'
import { CamelotKeyPicker } from './CamelotKeyPicker'

function buildTrackMeta(f: Track): Record<string, string | undefined> {
  return {
    title: f.title || undefined,
    artist: f.artist || undefined,
    album: f.album || undefined,
    genre: f.genre || undefined,
    bpm: f.bpm || undefined,
    key: f.key || undefined,
    year: f.year || undefined,
    remixer: f.remixer || undefined,
    grouping: f.grouping || undefined,
    composer: f.composer || undefined,
    comment: f.comment || undefined,
    label: f.label || undefined,
  }
}

// MOBILE TODO: This is CrateCloud's "Inspector" (see build-order notes) —
// the centered modal becomes a bottom sheet on mobile.
// Peek height: 120px (shows title + BPM + key).
// Full height: 85vh (all fields visible, scrollable).
// Dismiss: swipe down or tap outside.
export function TrackEditorModal({ track, onClose }: {
  track: Track
  onClose: () => void
}): React.JSX.Element {
  const { updateTrack, audioPort } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = usePlayerStore()
  const isThisPlaying = currentTrack?.id === track.id
  const [form, setForm] = useState<Track>({ ...track })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [artworkSrc, setArtworkSrc] = useState<string | undefined>(
    track.artwork_path && audioPort
      ? `http://127.0.0.1:${audioPort}${track.artwork_path}`
      : undefined
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef<Track>({ ...track })
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const isFirstRender = useRef(true)
  const skipNextDebounceRef = useRef(false)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      if (e.key === 'Escape' || (e.key === 'c' && !inInput)) onClose()
      // Space→togglePlayPause lives in PlayerBar now — it's always mounted
      // underneath this modal, so a second listener here would double-fire.
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, togglePlayPause])

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (skipNextDebounceRef.current) { skipNextDebounceRef.current = false; return }
    pendingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveStatus('pending')
    debounceRef.current = setTimeout(() => {
      pendingRef.current = false
      debounceRef.current = null
      const f = formRef.current
      if (mountedRef.current) setSaveStatus('saving')
      updateTrack(f.id, f)
      if (f.filepath) {
        window.api.editTags(f.filepath, buildTrackMeta(f), true)
          .then((r) => { if (mountedRef.current) setSaveStatus(r.success ? 'saved' : 'error') })
          .catch(() => { if (mountedRef.current) setSaveStatus('error') })
      } else {
        if (mountedRef.current) setSaveStatus('saved')
      }
    }, 1000)
  }, [form])

  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => { if (mountedRef.current) setSaveStatus('idle') }, 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  useEffect(() => {
    return () => {
      if (debounceRef.current && pendingRef.current) {
        clearTimeout(debounceRef.current)
        const f = formRef.current
        updateTrack(f.id, f)
        if (f.filepath) window.api.editTags(f.filepath, buildTrackMeta(f), true).catch(() => {})
      }
    }
  }, [])

  const set = (field: keyof Track, value: string) => {
    const next = { ...formRef.current, [field]: value }
    formRef.current = next
    setForm(next)
  }

  // Bypasses the normal 1000ms debounce for an explicit user choice (e.g.
  // picking an artist suggestion) — saves immediately instead.
  const commitNow = (field: keyof Track, value: string): void => {
    const next = { ...formRef.current, [field]: value }
    formRef.current = next
    skipNextDebounceRef.current = true
    setForm(next)
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    pendingRef.current = false
    setSaveStatus('saving')
    updateTrack(next.id, next)
    if (next.filepath) {
      window.api.editTags(next.filepath, buildTrackMeta(next), true)
        .then((r) => { if (mountedRef.current) setSaveStatus(r.success ? 'saved' : 'error') })
        .catch(() => { if (mountedRef.current) setSaveStatus('error') })
    } else {
      setSaveStatus('saved')
    }
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
            <ArtistInput
              value={form.artist}
              onChange={(v) => set('artist', v)}
              onCommit={(v) => commitNow('artist', v)}
            />
          </div>
          <div className="ca-row">
            <div className="ca-field">
              <div className="ca-label">BPM</div>
              <input className="ca-input" value={form.bpm} placeholder="—" onChange={(e) => set('bpm', e.target.value)} />
            </div>
          </div>
          <div className="ca-row">
            <div className="ca-field">
              <div className="ca-label">Key</div>
              <CamelotKeyPicker value={form.key} onChange={(v) => commitNow('key', v)} />
            </div>
          </div>
          <div className="ca-field">
            <div className="ca-label">Genre</div>
            <TagInput field="genre" value={form.genre ?? ''} onChange={(v) => set('genre', v)} />
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
            <TagInput field="remixer" value={form.remixer ?? ''} onChange={(v) => set('remixer', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Label</div>
            <TagInput field="label" value={form.label ?? ''} onChange={(v) => set('label', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Grouping</div>
            <TagInput field="grouping" value={form.grouping ?? ''} onChange={(v) => set('grouping', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Composer</div>
            <TagInput field="composer" value={form.composer ?? ''} onChange={(v) => set('composer', v)} />
          </div>
          <div className="ca-field">
            <div className="ca-label">Comment</div>
            <TagInput field="comment" value={form.comment ?? ''} onChange={(v) => set('comment', v)} />
          </div>

          <div className="ca-divider" />

          <div className="ca-meta">
            {track.duration_str && <span>{track.duration_str}</span>}
            {track.format && <span>{track.format}</span>}
            {track.file_size_mb != null && <span>{track.file_size_mb} MB</span>}
          </div>

          <div className="as-status">
            {saveStatus === 'pending' && <span className="as-pending">Unsaved…</span>}
            {saveStatus === 'saving' && <span className="as-saving">Saving…</span>}
            {saveStatus === 'saved' && <span className="as-saved">✓ Saved</span>}
            {saveStatus === 'error' && <span className="as-error">⚠ Save failed</span>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
