import { useEffect, useRef } from 'react'

// Attach the returned ref to an empty <div> at the bottom of a scrollable
// track list. Fires onVisible when that sentinel enters the viewport —
// rootMargin gives it a 200px head start so the next page loads before the
// DJ actually scrolls to the very bottom.
export function useScrollSentinel(
  onVisible: () => void,
  enabled: boolean
): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const onVisibleRef = useRef(onVisible)
  useEffect(() => {
    onVisibleRef.current = onVisible
  })

  useEffect(() => {
    if (!enabled) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisibleRef.current()
      },
      { threshold: 0.1, rootMargin: '0px 0px 200px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])

  return sentinelRef
}
