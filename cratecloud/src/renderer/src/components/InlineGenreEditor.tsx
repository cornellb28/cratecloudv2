import { useState, useRef, useEffect } from 'react'
import { useTagStore } from '../stores/useTagStore'

// Small popover for editing a track row's genre inline, without opening the
// full track editor. Suggestions come from useTagStore (the same managed
// genre tags TagInput draws from in TrackEditorModal/EditTagsDialog/
// BulkEditModal) rather than a separate distinct-values query, so this
// stays consistent with the rest of the genre system instead of adding a
// third source of "what genres exist."
//
// Unlike TagInput, this replaces the track's whole genre value on selection
// rather than adding to a slash-separated multi-value list — there's only
// room for one visible tag on a track row, and the spec's own language
// ("the tag just updates") describes a single-value swap, not a chip picker.

interface Props {
  value: string
  onSelect: (v: string) => void
  onClose: () => void
}

export function InlineGenreEditor({ value, onSelect, onClose }: Props): React.JSX.Element {
  const { tagsForField } = useTagStore()
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const q = query.trim().toLowerCase()
  const suggestions = tagsForField('genre')
    .filter((t) => !q || t.value.toLowerCase().includes(q))
    .slice(0, 8)

  return (
    <div
      className="ige-popover"
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        className="ige-input"
        autoFocus
        value={query}
        placeholder={value || 'Genre…'}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions[0]) { onSelect(suggestions[0].value); onClose() }
        }}
      />
      <div className="ige-list">
        {suggestions.map((t) => (
          <div
            key={t.id}
            className="ige-item"
            style={{ color: t.color }}
            onClick={() => { onSelect(t.value); onClose() }}
          >
            {t.value}
          </div>
        ))}
        {suggestions.length === 0 && <div className="ige-empty">No matching genres</div>}
      </div>
    </div>
  )
}
