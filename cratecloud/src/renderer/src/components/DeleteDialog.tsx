import { useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'

export function DeleteDialog(): React.JSX.Element | null {
  const {
    deleteDialog,
    allTracks,
    removeTracks,
    closeDeleteDialog,
    setDeletePreference,
  } = useLibraryStore()

  const [dontAskAgain, setDontAskAgain] = useState(false)

  if (!deleteDialog) return null

  const { trackIds } = deleteDialog
  const tracks = allTracks().filter((t) => trackIds.includes(t.id))
  const count = tracks.length
  const hasFiles = tracks.some((t) => t.filepath)

  const label =
    count === 1
      ? `"${tracks[0]?.title ?? 'this track'}"`
      : `${count} tracks`

  const confirm = async (mode: 'remove' | 'trash') => {
    if (dontAskAgain) setDeletePreference(mode)

    if (mode === 'trash') {
      for (const track of tracks) {
        if (track.filepath) {
          try {
            await window.api.fs.trashFile(track.filepath)
          } catch (err) {
            console.error('Trash failed for', track.filepath, err)
          }
        }
      }
    }

    removeTracks(trackIds)
    closeDeleteDialog()
    setDontAskAgain(false)
  }

  return (
    <div className="dialog-backdrop" onClick={closeDeleteDialog}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Remove {label}?</div>

        <div className="dialog-option" onClick={() => confirm('remove')}>
          <div className="dialog-radio" />
          <div>
            <div className="dialog-option-label">Remove from library</div>
            <div className="dialog-option-sub">File stays on disk — only removed from CrateCloud</div>
          </div>
        </div>

        {hasFiles && (
          <div className="dialog-option" onClick={() => confirm('trash')}>
            <div className="dialog-radio" />
            <div>
              <div className="dialog-option-label">Move to Trash</div>
              <div className="dialog-option-sub">File goes to the system Trash — recoverable</div>
            </div>
          </div>
        )}

        <label className="dialog-dont-ask">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
          />
          <span>Don&apos;t ask again</span>
        </label>

        <div className="dialog-actions">
          <button
            className="dialog-btn"
            onClick={() => { closeDeleteDialog(); setDontAskAgain(false) }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
