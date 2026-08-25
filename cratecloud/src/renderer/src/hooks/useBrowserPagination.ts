import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '../types/track'

export type BrowserPaginationOptions = {
  fetchPage: (offset: number, limit: number) => Promise<Track[]>
  fetchTotal: () => Promise<number>
  pageSize?: number
  // Changes when the selected genre/artist/folder changes — triggers a full
  // reset + reload. Distinct from fetchPage/fetchTotal identity because
  // those are often recreated every render as inline closures; key is the
  // one thing callers are expected to keep stable/meaningful.
  key: string
}

export type BrowserPaginationState = {
  tracks: Track[]
  total: number
  loading: boolean
  hasMore: boolean
  error: string | null
  loadInitial: () => Promise<void>
  loadMore: () => Promise<void>
  reset: () => Promise<void>
}

const DEFAULT_PAGE_SIZE = 75

// Generic pagination for any "browse tracks by X" view (genre, artist,
// folder, …) — same shape as the track-list state each of those views
// needs, parameterized by how to fetch a page/total instead of always
// calling db.tracksPaginated like the library-wide loader in
// useLibraryStore.initFromDb does.
export function useBrowserPagination(options: BrowserPaginationOptions): BrowserPaginationState {
  const { fetchPage, fetchTotal, key } = options
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  const [tracks, setTracks] = useState<Track[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs, not state, for the in-flight guard — a loadMore() queued right
  // before a loadInitial() reset must see the reset synchronously (state
  // updates aren't visible until the next render) or it'll append a stale
  // page onto freshly-cleared tracks.
  const inFlightRef = useRef(false)
  const requestIdRef = useRef(0)
  const offsetRef = useRef(0)
  const fetchPageRef = useRef(fetchPage)
  const fetchTotalRef = useRef(fetchTotal)
  useEffect(() => {
    fetchPageRef.current = fetchPage
    fetchTotalRef.current = fetchTotal
  })

  const loadInitial = useCallback(async () => {
    // Invalidates any in-flight loadMore (it checks requestId before
    // committing its result) and starts a fresh request generation.
    const requestId = ++requestIdRef.current
    inFlightRef.current = true
    offsetRef.current = 0
    setLoading(true)
    setError(null)
    try {
      const [totalCount, firstPage] = await Promise.all([
        fetchTotalRef.current(),
        fetchPageRef.current(0, pageSize)
      ])
      if (requestId !== requestIdRef.current) return // superseded by a newer loadInitial/reset
      offsetRef.current = firstPage.length
      setTracks(firstPage)
      setTotal(totalCount)
      setHasMore(offsetRef.current < totalCount)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false
        setLoading(false)
      }
    }
  }, [pageSize])

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMore) return
    const requestId = requestIdRef.current
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const page = await fetchPageRef.current(offsetRef.current, pageSize)
      if (requestId !== requestIdRef.current) return // a loadInitial/reset happened mid-flight
      offsetRef.current += page.length
      setTracks((prev) => [...prev, ...page])
      setHasMore(offsetRef.current < total && page.length > 0)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false
        setLoading(false)
      }
    }
  }, [hasMore, pageSize, total])

  const reset = useCallback(async () => {
    setTracks([])
    setTotal(0)
    setHasMore(false)
    offsetRef.current = 0
    await loadInitial()
  }, [loadInitial])

  useEffect(() => {
    // Intentional: the whole point of this effect is "key changed -> refetch",
    // which is a genuine setState-in-effect (data fetch triggered by a prop
    // change), not the "derived state" anti-pattern the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reset()
    // Only key is meant to drive this — fetchPage/fetchTotal are read via
    // refs above precisely so an inline-closure identity change doesn't
    // also trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { tracks, total, loading, hasMore, error, loadInitial, loadMore, reset }
}
