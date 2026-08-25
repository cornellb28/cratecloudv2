import { useState, useRef, useEffect } from 'react'

// Artist is a single free-text value (unlike genre/remixer/label/etc, which
// are slash-separated multi-value fields managed through useTagStore) — so
// this is a plain combobox over the library's existing artist strings
// (db.allArtists()), not a reuse of TagInput's multi-chip UI.

interface Props {
  value: string
  onChange: (v: string) => void
  // Fired only when the user explicitly picks a suggestion — callers should
  // save immediately rather than waiting for their normal debounce/blur.
  onCommit: (v: string) => void
  // Matches whichever text-input class the host form already uses
  // (.ca-input in TrackEditorModal/LibraryView, .edit-input in EditTagsDialog).
  inputClassName?: string
}

const MAX_SUGGESTIONS = 8
const FETCH_DEBOUNCE_MS = 150
const WARNING_DURATION_MS = 2000

export function ArtistInput({ value, onChange, onCommit, inputClassName = 'ca-input' }: Props): React.JSX.Element {
  const [artists, setArtists] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [newWarning, setNewWarning] = useState(false)
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    }
  }, [])

  // allArtists() has no server-side query filter — it's the full distinct
  // list — so "debounce the fetch" means debounce the one-time load, then
  // filter client-side on every keystroke rather than refetching.
  const loadArtists = (): void => {
    if (loadedRef.current) return
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(() => {
      loadedRef.current = true
      window.api.db.allArtists().then((rows) => setArtists(rows.map((r) => r.artist)))
    }, FETCH_DEBOUNCE_MS)
  }

  const q = value.trim().toLowerCase()
  const suggestions = (
    q ? artists.filter((a) => a.toLowerCase().includes(q)) : artists
  ).slice(0, MAX_SUGGESTIONS)
  const exactMatch = artists.some((a) => a.toLowerCase() === q)

  const select = (name: string): void => {
    onChange(name)
    onCommit(name)
    setOpen(false)
  }

  const handleFocus = (): void => {
    if (warningTimerRef.current) { clearTimeout(warningTimerRef.current); warningTimerRef.current = null }
    setNewWarning(false)
    loadArtists()
    setOpen(true)
    setHighlighted(0)
  }

  const handleBlur = (): void => {
    // Delayed so a suggestion click's onMouseDown (which already prevents
    // default) has a moment to land before the dropdown unmounts.
    setTimeout(() => {
      setOpen(false)
      const trimmed = value.trim()
      if (trimmed && !exactMatch) {
        setNewWarning(true)
        warningTimerRef.current = setTimeout(() => setNewWarning(false), WARNING_DURATION_MS)
      }
    }, 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (suggestions[highlighted]) {
        e.preventDefault()
        select(suggestions[highlighted])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="artist-input-wrap">
      <input
        className={inputClassName}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setHighlighted(0)
          setOpen(true)
          loadArtists()
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Artist name"
      />
      {open && suggestions.length > 0 && (
        <div className="artist-suggestions">
          {suggestions.map((name, i) => (
            <div
              key={name}
              className={`artist-suggestion-item${i === highlighted ? ' highlighted' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(name)}
              onMouseEnter={() => setHighlighted(i)}
            >
              {name}
            </div>
          ))}
        </div>
      )}
      {newWarning && (
        <div className="artist-new-warning">New artist — not in your library yet</div>
      )}
    </div>
  )
}
