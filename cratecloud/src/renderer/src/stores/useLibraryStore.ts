import { create } from 'zustand'
import type { Track } from '../types/track'
import { INITIAL_COLUMNS } from '../types/track'

type LibraryState = {
  columns: Record<string, Track[]>
  selected: Set<number>
  activeTrack: Track | null
  activeTrackCol: string | null
  activeTab: string
  searchQuery: string

  setActiveTab: (tab: string) => void
  setSearchQuery: (q: string) => void
  toggleSelect: (id: number) => void
  clearSelection: () => void
  moveTrack: (trackId: number, fromCol: string, toCol: string) => void
  bulkMove: (targetCol: string) => void
  updateTrack: (id: number, updates: Partial<Track>) => void
  setActiveTrack: (track: Track | null, col: string | null) => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  columns: INITIAL_COLUMNS,
  selected: new Set(),
  activeTrack: null,
  activeTrackCol: null,
  activeTab: 'Board',
  searchQuery: '',

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleSelect: (id) => {
    const selected = new Set(get().selected)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    set({ selected })
  },

  clearSelection: () => set({ selected: new Set() }),

  moveTrack: (trackId, fromCol, toCol) => {
    if (fromCol === toCol) return
    const columns = { ...get().columns }
    const track = columns[fromCol]?.find((t) => t.id === trackId)
    if (!track) return
    columns[fromCol] = columns[fromCol].filter((t) => t.id !== trackId)
    columns[toCol] = [...columns[toCol], track]
    set({ columns: { ...columns } })
  },

  bulkMove: (targetCol) => {
    const { selected, columns } = get()
    const updated: Record<string, Track[]> = {}
    Object.keys(columns).forEach((col) => {
      updated[col] = [...columns[col]]
    })
    selected.forEach((id) => {
      Object.keys(updated).forEach((col) => {
        if (col === targetCol) return
        const idx = updated[col].findIndex((t) => t.id === id)
        if (idx > -1) {
          const [track] = updated[col].splice(idx, 1)
          updated[targetCol] = [...updated[targetCol], track]
        }
      })
    })
    set({ columns: updated, selected: new Set() })
  },

  updateTrack: (id, updates) => {
    const columns = { ...get().columns }
    Object.keys(columns).forEach((col) => {
      columns[col] = columns[col].map((t) => (t.id === id ? { ...t, ...updates } : t))
    })
    const activeTrack = get().activeTrack
    set({
      columns,
      activeTrack: activeTrack?.id === id ? { ...activeTrack, ...updates } : activeTrack,
    })
  },

  setActiveTrack: (track, col) => set({ activeTrack: track, activeTrackCol: col }),
}))
