import { createContext, useContext, useState, useCallback } from 'react'
import type { Track } from '../types/track'

export type ContextMenuState = {
  x: number
  y: number
  track: Track
  col: string
}

type ContextMenuContextType = {
  menu: ContextMenuState | null
  openMenu: (x: number, y: number, track: Track, col: string) => void
  closeMenu: () => void
}

const ContextMenuContext = createContext<ContextMenuContextType>({
  menu: null,
  openMenu: () => {},
  closeMenu: () => {},
})

export function ContextMenuProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const openMenu = useCallback((x: number, y: number, track: Track, col: string) => {
    setMenu({ x, y, track, col })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  return (
    <ContextMenuContext.Provider value={{ menu, openMenu, closeMenu }}>
      {children}
    </ContextMenuContext.Provider>
  )
}

export const useContextMenu = () => useContext(ContextMenuContext)
