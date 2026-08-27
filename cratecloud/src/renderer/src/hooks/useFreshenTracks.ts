import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../types/track'
import { useLibraryStore } from '../stores/useLibraryStore'

const LEAVE_DURATION_MS = 550

export type FreshenedTrack = Track & { leaving?: boolean }

// useBrowserPagination's tracks are a local snapshot from direct DB
// fetches — they don't read from useLibraryStore, so an edit made
// elsewhere (or via one of this same list's own TrackCards, which write
// through the store) sits stale until the next full reset. This freshens
// each row from the reactive store before rendering — cheap (one Map
// lookup per row) and fixes staleness for every field, not just genre.
//
// Pass belongsInView to also handle the "moved" case: a track edited so it
// no longer matches this view (e.g. its genre changed away from the genre
// this view is scoped to) is flagged `leaving: true` immediately (so the
// caller can fade it via CSS), then actually dropped from the returned
// array after LEAVE_DURATION_MS. The flag itself is always computed fresh
// against live data, so it can't go stale — only the removal is deferred.
// Without belongsInView, tracks are just freshened in place, never removed.
export function useFreshenTracks(
  tracks: Track[],
  belongsInView?: (t: Track) => boolean
): FreshenedTrack[] {
  const { columns, allTracks } = useLibraryStore()
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set())
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const freshTracks = useMemo(() => {
    const byId = new Map(allTracks().map((t) => [t.id, t]))
    return tracks.map((t) => byId.get(t.id) ?? t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, columns, allTracks])

  useEffect(() => {
    if (!belongsInView) return
    const presentIds = new Set(freshTracks.map((t) => t.id))

    for (const t of freshTracks) {
      if (!belongsInView(t) && !removedIds.has(t.id) && !timersRef.current.has(t.id)) {
        timersRef.current.set(
          t.id,
          setTimeout(() => {
            timersRef.current.delete(t.id)
            setRemovedIds((prev) => new Set(prev).add(t.id))
          }, LEAVE_DURATION_MS)
        )
      }
    }

    // A track that dropped out of the source list entirely (pagination
    // reset, navigated to a different genre/artist) needs its timer/id
    // bookkeeping cleared too, or stale entries pile up across resets.
    for (const [id, timer] of timersRef.current) {
      if (!presentIds.has(id)) {
        clearTimeout(timer)
        timersRef.current.delete(id)
      }
    }
    const staleRemoved = [...removedIds].filter((id) => !presentIds.has(id))
    if (staleRemoved.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemovedIds((prev) => {
        const next = new Set(prev)
        staleRemoved.forEach((id) => next.delete(id))
        return next
      })
    }
  }, [freshTracks, belongsInView, removedIds])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])

  return useMemo(
    () =>
      freshTracks
        .filter((t) => !removedIds.has(t.id))
        .map((t) => (belongsInView && !belongsInView(t) ? { ...t, leaving: true } : t)),
    [freshTracks, removedIds, belongsInView]
  )
}
