import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { CRATE_COLORS } from '../types/track'

const WIDTH = 200
const MAX_HEIGHT = 280

type Props = {
  trackId: number
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

// Membership is already fully loaded in the store (crates[i].trackIds) —
// no fetch needed on open. addTracksToCrate/removeTracksFromCrate await
// their IPC call before updating store state, so this component keeps its
// own optimistic override (revert on error) rather than changing that
// shared, already-non-optimistic behavior every other crate toggle in the
// app relies on.
export function CratePicker({ trackId, anchorRef, onClose }: Props): React.JSX.Element | null {
  const { crates, addTracksToCrate, removeTracksFromCrate, createCrate } = useLibraryStore()
  const ref = useRef<HTMLDivElement>(null)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [memberOverride, setMemberOverride] = useState<Map<number, boolean>>(new Map())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const above = window.innerHeight - rect.bottom < MAX_HEIGHT + 12
    setPos({
      left: Math.min(rect.left, window.innerWidth - WIDTH - 12),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
    })
  }, [anchorRef])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchorRef.current?.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  const isMember = (crateId: number, baseMember: boolean): boolean =>
    memberOverride.has(crateId) ? (memberOverride.get(crateId) as boolean) : baseMember

  const toggle = async (crateId: number, currentlyMember: boolean): Promise<void> => {
    setMemberOverride((m) => new Map(m).set(crateId, !currentlyMember))
    setPendingIds((s) => new Set(s).add(crateId))
    try {
      if (currentlyMember) await removeTracksFromCrate(crateId, [trackId])
      else await addTracksToCrate(crateId, [trackId])
      setMemberOverride((m) => {
        const next = new Map(m)
        next.delete(crateId)
        return next
      })
    } catch {
      setMemberOverride((m) => new Map(m).set(crateId, currentlyMember)) // revert
    } finally {
      setPendingIds((s) => {
        const next = new Set(s)
        next.delete(crateId)
        return next
      })
    }
  }

  const handleCreateCrate = async (): Promise<void> => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = await createCrate(trimmed, CRATE_COLORS[0])
    await addTracksToCrate(id, [trackId])
    setNewName('')
    setCreating(false)
  }

  if (!pos) return null

  return (
    <div
      ref={ref}
      className="crate-picker"
      style={{
        left: pos.left,
        top: pos.top,
        transform: pos.above ? 'translateY(-100%)' : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="crate-picker-list">
        {crates.length === 0 && (
          <div className="crate-picker-empty">No crates yet.</div>
        )}
        {crates.map((c) => {
          const member = isMember(c.id, c.trackIds.has(trackId))
          return (
            <label key={c.id} className="crate-picker-row">
              <input
                type="checkbox"
                checked={member}
                disabled={pendingIds.has(c.id)}
                onChange={() => void toggle(c.id, member)}
              />
              <span className="crate-picker-dot" style={{ background: c.color }} />
              <span className="crate-picker-name">{c.name}</span>
              <span className="crate-picker-count">{c.trackIds.size}</span>
            </label>
          )
        })}
      </div>

      <div className="crate-picker-sep" />
      {creating ? (
        <input
          className="crate-picker-new-input"
          value={newName}
          autoFocus
          placeholder="Crate name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void handleCreateCrate() }
            if (e.key === 'Escape') { e.preventDefault(); setCreating(false); setNewName('') }
          }}
          onBlur={() => { if (!newName.trim()) setCreating(false) }}
        />
      ) : (
        <div className="crate-picker-row crate-picker-add" onClick={() => setCreating(true)}>
          + New crate
        </div>
      )}
    </div>
  )
}
