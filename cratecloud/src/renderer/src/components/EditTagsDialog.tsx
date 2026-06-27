import { useState, useEffect } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'

type FormFields = {
  title: string
  artist: string
  album: string
  genre: string
  bpm: string
  key: string
  year: string
  remixer: string
  grouping: string
  composer: string
  comment: string
  label: string
}

export function EditTagsDialog(): React.JSX.Element | null {
  const { editDialog, closeEditDialog, updateTrack } = useLibraryStore()

  const [fields, setFields] = useState<FormFields>({
    title: '', artist: '', album: '', genre: '', bpm: '', key: '', year: '',
    remixer: '', grouping: '', composer: '', comment: '', label: '',
  })
  const [writeToFile, setWriteToFile] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seratoNote, setSeratoNote] = useState<string | null>(null)

  useEffect(() => {
    if (editDialog) {
      const t = editDialog.track
      setFields({
        title: t.title ?? '',
        artist: t.artist ?? '',
        album: t.album ?? '',
        genre: t.genre ?? '',
        bpm: t.bpm ?? '',
        key: t.key ?? '',
        year: t.year ?? '',
        remixer: t.remixer ?? '',
        grouping: t.grouping ?? '',
        composer: t.composer ?? '',
        comment: t.comment ?? '',
        label: t.label ?? '',
      })
      setError(null)
      setSeratoNote(null)
    }
  }, [editDialog])

  if (!editDialog) return null

  const { track } = editDialog
  const hasFile = !!track.filepath

  const update = (field: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [field]: e.target.value }))

  const save = async () => {
    setSaving(true)
    setError(null)
    setSeratoNote(null)

    const storeUpdates = {
      title: fields.title,
      artist: fields.artist,
      album: fields.album || undefined,
      genre: fields.genre,
      bpm: fields.bpm,
      key: fields.key,
      year: fields.year || undefined,
      remixer: fields.remixer,
      grouping: fields.grouping,
      composer: fields.composer,
      comment: fields.comment,
      label: fields.label,
    }

    updateTrack(track.id, storeUpdates)

    let fileError: string | null = null

    if (writeToFile && hasFile) {
      try {
        const meta: Record<string, string | undefined> = {
          title: fields.title || undefined,
          artist: fields.artist || undefined,
          album: fields.album || undefined,
          genre: fields.genre || undefined,
          bpm: fields.bpm || undefined,
          key: fields.key || undefined,
          year: fields.year || undefined,
          remixer: fields.remixer || undefined,
          grouping: fields.grouping || undefined,
          composer: fields.composer || undefined,
          comment: fields.comment || undefined,
          label: fields.label || undefined,
        }
        const result = await window.api.editTags(track.filepath!, meta, true)
        if (!result.success) {
          fileError = `File write failed: ${result.error}`
          setError(fileError)
        } else if (result.serato_written) {
          setSeratoNote('Tags saved · Serato updated')
        } else {
          setSeratoNote('Tags saved to file')
        }
      } catch (err) {
        fileError = `Could not write file: ${String(err)}`
        setError(fileError)
      }
    }

    setSaving(false)
    if (!fileError) closeEditDialog()
  }

  return (
    <div className="dialog-backdrop" onClick={closeEditDialog}>
      <div className="dialog edit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Edit Tags</div>
        {track.filepath && (
          <div className="edit-filepath">{track.filepath.split('/').pop()}</div>
        )}

        <div className="edit-grid">
          <label className="edit-label">Title</label>
          <input className="edit-input" value={fields.title} onChange={update('title')} placeholder="Track title" />

          <label className="edit-label">Artist</label>
          <input className="edit-input" value={fields.artist} onChange={update('artist')} placeholder="Artist name" />

          <label className="edit-label">Album</label>
          <input className="edit-input" value={fields.album} onChange={update('album')} placeholder="Album" />

          <label className="edit-label">Genre</label>
          <input className="edit-input" value={fields.genre} onChange={update('genre')} placeholder="Genre" />

          <label className="edit-label">BPM</label>
          <input className="edit-input edit-input-narrow" value={fields.bpm} onChange={update('bpm')} placeholder="128" />

          <label className="edit-label">Key (Camelot)</label>
          <input className="edit-input edit-input-narrow" value={fields.key} onChange={update('key')} placeholder="8A" />

          <label className="edit-label">Year</label>
          <input className="edit-input edit-input-narrow" value={fields.year} onChange={update('year')} placeholder="2024" />

          <label className="edit-label">Remixer</label>
          <input className="edit-input" value={fields.remixer} onChange={update('remixer')} placeholder="Remixer name" />

          <label className="edit-label">Grouping</label>
          <input className="edit-input" value={fields.grouping} onChange={update('grouping')} placeholder="Grouping" />

          <label className="edit-label">Composer</label>
          <input className="edit-input" value={fields.composer} onChange={update('composer')} placeholder="Composer" />

          <label className="edit-label">Label</label>
          <input className="edit-input" value={fields.label} onChange={update('label')} placeholder="Record label" />

          <label className="edit-label">Comment</label>
          <input className="edit-input" value={fields.comment} onChange={update('comment')} placeholder="Comment" />
        </div>

        {hasFile && (
          <label className="edit-write-toggle">
            <input
              type="checkbox"
              checked={writeToFile}
              onChange={(e) => setWriteToFile(e.target.checked)}
            />
            <span>Write tags to file</span>
            <span className="edit-serato-badge">+ Serato</span>
          </label>
        )}

        {error && <div className="edit-error">{error}</div>}
        {seratoNote && !error && <div className="edit-success">{seratoNote}</div>}

        <div className="dialog-actions">
          <button className="dialog-btn" onClick={closeEditDialog} disabled={saving}>
            Cancel
          </button>
          <button className="dialog-btn dialog-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
