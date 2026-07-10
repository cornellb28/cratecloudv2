import { useState, useRef, useEffect } from 'react'
import { useTagStore, type TagField, type Tag } from '../stores/useTagStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { CRATE_COLORS } from '../types/track'

type CtxMenu = { tag: Tag; x: number; y: number } | null

interface Props {
  field: TagField
  value: string   // slash-separated field value from the form
  onChange: (v: string) => void
}

export function TagInput({ field, value, onChange }: Props): React.JSX.Element {
  const { tagsForField, addTag, removeTag, updateTag } = useTagStore()
  const { allTracks, updateTrack } = useLibraryStore()

  const [inputText, setInputText] = useState('')
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)
  const [renaming, setRenaming] = useState<Tag | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const ctxRef = useRef<HTMLDivElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const dismiss = (e: MouseEvent) => {
      if (!ctxRef.current?.contains(e.target as Node)) {
        setCtxMenu(null)
        setRenaming(null)
      }
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [ctxMenu])

  useEffect(() => {
    if (renaming) renameRef.current?.focus()
  }, [renaming])

  const appliedParts = value.split('/').map((s) => s.trim()).filter(Boolean)
  const suggestions = tagsForField(field)
  const q = inputText.trim().toLowerCase()
  const visibleSuggestions = q
    ? suggestions.filter((t) => t.value.toLowerCase().includes(q))
    : suggestions
  const exactMatch = suggestions.find((t) => t.value.toLowerCase() === q)
  const showCreate = q.length > 0 && !exactMatch

  const removeFromField = (tagValue: string) => {
    const parts = appliedParts.filter((p) => p !== tagValue)
    onChange(parts.join('/'))
  }

  const applyToField = (tagValue: string) => {
    if (appliedParts.includes(tagValue)) return
    onChange([...appliedParts, tagValue].join('/'))
    setInputText('')
  }

  const handleCreate = async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return
    await addTag(field, trimmed, CRATE_COLORS[0])
    // addTag deduplicates; apply regardless
    applyToField(trimmed)
  }

  const handleRename = async () => {
    if (!renaming) return
    const trimmed = renameVal.trim()
    if (!trimmed || trimmed === renaming.value) {
      setRenaming(null)
      setCtxMenu(null)
      return
    }
    const oldValue = renaming.value
    await updateTag(renaming.id, trimmed, renaming.color)
    // Cascade rename across all track fields
    for (const t of allTracks()) {
      const raw = t[field as keyof typeof t] as string | undefined
      if (!raw) continue
      const parts = raw.split('/').map((s) => s.trim()).filter(Boolean)
      if (parts.includes(oldValue)) {
        updateTrack(t.id, { [field]: parts.map((p) => (p === oldValue ? trimmed : p)).join('/') })
      }
    }
    // Update local applied value if we renamed something applied to this field
    if (appliedParts.includes(oldValue)) {
      onChange(appliedParts.map((p) => (p === oldValue ? trimmed : p)).join('/'))
    }
    setRenaming(null)
    setCtxMenu(null)
  }

  const handleDeleteTag = async (tag: Tag) => {
    await removeTag(tag.id)
    setCtxMenu(null)
  }

  const openCtx = (e: React.MouseEvent, tag: Tag) => {
    e.preventDefault()
    setCtxMenu({ tag, x: e.clientX, y: e.clientY })
    setRenaming(null)
  }

  return (
    <div className="ti-wrap">
      {/* Applied tag pills */}
      {appliedParts.length > 0 && (
        <div className="ti-applied">
          {appliedParts.map((part) => (
            <div key={part} className="ti-pill">
              <span className="ti-pill-val">{part}</span>
              <button
                className="ti-pill-x"
                onClick={() => removeFromField(part)}
                type="button"
                title={`Remove "${part}" from this track`}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Type-to-search input */}
      <input
        className="ca-input ti-input"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder={appliedParts.length > 0 ? 'Add another tag…' : 'Search or type to add…'}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (exactMatch) applyToField(exactMatch.value)
            else if (inputText.trim()) handleCreate()
          }
          if (e.key === 'Escape') setInputText('')
        }}
      />

      {/* Suggestions */}
      {(visibleSuggestions.length > 0 || showCreate) && (
        <div className="ti-suggestions">
          {visibleSuggestions.map((tag) => {
            const applied = appliedParts.includes(tag.value)
            return (
              <button
                key={tag.id}
                className={`insp-tag-chip${applied ? ' ti-chip-applied' : ''}`}
                style={{ borderColor: tag.color, color: applied ? '#fff' : tag.color, background: applied ? tag.color + '44' : 'none' }}
                onClick={() => applied ? removeFromField(tag.value) : applyToField(tag.value)}
                onContextMenu={(e) => openCtx(e, tag)}
                type="button"
                title={applied ? `Click to remove "${tag.value}" · Right-click to edit/delete` : `Click to apply · Right-click to edit/delete`}
              >
                {applied && <span className="ti-chip-check">✓ </span>}{tag.value}
              </button>
            )
          })}
          {showCreate && (
            <button className="ti-create-chip" onClick={handleCreate} type="button">
              + Create "{inputText.trim()}"
            </button>
          )}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="ctx-menu ti-ctx"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999 }}
        >
          {renaming?.id === ctxMenu.tag.id ? (
            <div className="ti-edit-row">
              <input
                ref={renameRef}
                className="ti-edit-input"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') { setRenaming(null); setCtxMenu(null) }
                }}
                placeholder="New name…"
              />
              <button className="ti-edit-ok" onClick={handleRename} type="button">✓</button>
            </div>
          ) : (
            <>
              <div
                className="ctx-item"
                onClick={() => { setRenaming(ctxMenu.tag); setRenameVal(ctxMenu.tag.value) }}
              >
                Rename tag…
              </div>
              <div
                className="ctx-item ctx-danger"
                onClick={() => handleDeleteTag(ctxMenu.tag)}
              >
                Delete tag
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
