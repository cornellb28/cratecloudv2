import { useState } from 'react'

// Shared by TrackEditorModal (Inspector) and BulkEditModal — a visual
// Camelot wheel picker instead of a plain text input for the Key field.

interface Props {
  value: string
  onChange: (key: string) => void
}

const NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1)
const CELLS = [...NUMBERS.map((n) => `${n}A`), ...NUMBERS.map((n) => `${n}B`)]

function parseKey(k: string): { num: number; letter: 'A' | 'B' } | null {
  const m = /^(\d{1,2})([AB])$/i.exec(k.trim())
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: m[2].toUpperCase() as 'A' | 'B' }
}

function relation(reference: string, key: string): 'ref' | 'adjacent' | 'parallel' | null {
  if (reference === key) return 'ref'
  const pa = parseKey(reference)
  const pb = parseKey(key)
  if (!pa || !pb) return null
  if (pa.letter === pb.letter) {
    const diff = Math.abs(pa.num - pb.num)
    if (diff === 1 || diff === 11) return 'adjacent'
  } else if (pa.num === pb.num) {
    return 'parallel'
  }
  return null
}

export function CamelotKeyPicker({ value, onChange }: Props): React.JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null)
  const [focusIdx, setFocusIdx] = useState(() => Math.max(CELLS.indexOf(value.trim().toUpperCase()), 0))

  const reference = hovered ?? (value.trim() ? value.trim().toUpperCase() : null)

  const handleKeyDown = (e: React.KeyboardEvent, idx: number): void => {
    let next = idx
    if (e.key === 'ArrowRight') next = Math.min(idx + 1, CELLS.length - 1)
    else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0)
    else if (e.key === 'ArrowDown') next = Math.min(idx + 12, CELLS.length - 1)
    else if (e.key === 'ArrowUp') next = Math.max(idx - 12, 0)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(CELLS[idx])
      return
    } else {
      return
    }
    e.preventDefault()
    setFocusIdx(next)
    document.getElementById(`ckp-cell-${next}`)?.focus()
  }

  return (
    <div className="ckp-grid" onMouseLeave={() => setHovered(null)}>
      {CELLS.map((key, idx) => {
        const state = key === value.trim().toUpperCase() ? 'selected' : reference ? relation(reference, key) : null
        return (
          <button
            key={key}
            id={`ckp-cell-${idx}`}
            type="button"
            className={`ckp-cell${state ? ` ckp-${state}` : ''}`}
            onMouseEnter={() => setHovered(key)}
            onClick={() => onChange(key)}
            onFocus={() => setFocusIdx(idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            tabIndex={idx === focusIdx ? 0 : -1}
            title={key}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
