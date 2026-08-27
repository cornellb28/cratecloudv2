import { useEffect, useMemo, useRef, useState } from 'react'

// Generic exit-transition helper for lists whose membership is recomputed
// from scratch every render (e.g. FolderSubtree's `allTracks.filter(t =>
// t.folder_id === folder.id)`) — unlike useFreshenTracks's locally-
// paginated snapshot, an item that stops matching here doesn't linger in
// `items` with stale data; it's just gone from the array on the very next
// render (the store itself is already fully live). This keeps a departed
// item rendered — frozen at its last-known value, flagged `leaving: true`
// — for `duration` ms so the caller can fade it out via CSS, instead of it
// vanishing instantly.
export function useLeaveTransition<T extends { id: number }>(
  items: T[],
  duration = 550
): (T & { leaving?: boolean })[] {
  const [departedExtras, setDepartedExtras] = useState<(T & { leaving: true })[]>([])
  const prevIdsRef = useRef<Set<number>>(new Set(items.map((t) => t.id)))
  const lastSeenRef = useRef<Map<number, T>>(new Map(items.map((t) => [t.id, t])))
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const idsKey = useMemo(
    () =>
      items
        .map((t) => t.id)
        .sort((a, b) => a - b)
        .join(','),
    [items]
  )

  useEffect(() => {
    const currentIds = new Set(items.map((t) => t.id))
    const departedIds = [...prevIdsRef.current].filter((id) => !currentIds.has(id))
    const snapshots = departedIds
      .map((id) => lastSeenRef.current.get(id))
      .filter((t): t is T => !!t)
    prevIdsRef.current = currentIds
    lastSeenRef.current = new Map(items.map((t) => [t.id, t]))
    if (snapshots.length === 0) return

    // Membership just changed (an item moved out of this list via drag,
    // the move-to-folder button, etc.) — hold it a moment longer, faded,
    // so it doesn't just vanish. No reset-on-navigation concern: this hook
    // is instantiated per list (e.g. per FolderSubtree), unmounted with it.
    setDepartedExtras((prev) => [
      ...prev.filter((p) => !departedIds.includes(p.id)),
      ...snapshots.map((t) => ({ ...t, leaving: true as const }))
    ])
    snapshots.forEach((t) => {
      if (timersRef.current.has(t.id)) return
      timersRef.current.set(
        t.id,
        setTimeout(() => {
          timersRef.current.delete(t.id)
          setDepartedExtras((prev) => prev.filter((p) => p.id !== t.id))
        }, duration)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])

  return useMemo(() => [...items, ...departedExtras], [items, departedExtras])
}
