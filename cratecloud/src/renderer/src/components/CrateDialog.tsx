import { useState, useEffect } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { CRATE_COLORS } from '../types/track'

export function CrateDialog(): React.JSX.Element | null {
  const { crateDialog, closeCrateDialog, createCrate, updateCrate, deleteCrate } = useLibraryStore()

  const [name, setName] = useState('')
  const [color, setColor] = useState(CRATE_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!crateDialog) return
    if (crateDialog.mode === 'edit') {
      setName(crateDialog.crate.name)
      setColor(crateDialog.crate.color)
    } else {
      setName('')
      setColor(CRATE_COLORS[0])
    }
    setSaving(false)
  }, [crateDialog])

  if (!crateDialog) return null

  const isEdit = crateDialog.mode === 'edit'

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    if (isEdit) {
      await updateCrate(crateDialog.crate.id, name.trim(), color)
    } else {
      await createCrate(name.trim(), color)
    }
    setSaving(false)
    closeCrateDialog()
  }

  const handleDelete = async () => {
    if (!isEdit) return
    await deleteCrate(crateDialog.crate.id)
    closeCrateDialog()
  }

  return (
    <div className="dialog-backdrop" onClick={closeCrateDialog}>
      <div className="dialog crate-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{isEdit ? 'Edit Crate' : 'New Crate'}</div>

        <div className="crate-form">
          <label className="crate-label">Name</label>
          <input
            className="crate-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Crate name"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />

          <label className="crate-label">Color</label>
          <div className="crate-colors">
            {CRATE_COLORS.map((c) => (
              <button
                key={c}
                className={`crate-color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="dialog-actions">
          {isEdit && (
            <button className="dialog-btn crate-delete-btn" onClick={handleDelete} disabled={saving}>
              Delete crate
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="dialog-btn" onClick={closeCrateDialog} disabled={saving}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-primary"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
