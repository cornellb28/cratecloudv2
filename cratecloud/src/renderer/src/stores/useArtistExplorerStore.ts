import { create } from 'zustand'

export type ArtistFilter = { field: string; value: string }
export type FilterMode = 'OR' | 'AND'

function loadViewMode(): 'list' | 'grid' {
  try { return (localStorage.getItem('ae-view-mode') as 'list' | 'grid') ?? 'list' }
  catch { return 'list' }
}

type ArtistExplorerState = {
  selectedArtist: string | null
  activeTags: ArtistFilter[]
  filterMode: FilterMode
  viewMode: 'list' | 'grid'
  selectedIds: Set<number>

  selectArtist: (artist: string | null) => void
  toggleTag: (field: string, value: string) => void
  clearFilters: () => void
  setFilterMode: (mode: FilterMode) => void
  isTagActive: (field: string, value: string) => boolean
  setViewMode: (mode: 'list' | 'grid') => void
  toggleSelect: (id: number) => void
  setSelectedIds: (ids: number[]) => void
  clearSelection: () => void
}

export const useArtistExplorerStore = create<ArtistExplorerState>((set, get) => ({
  selectedArtist: null,
  activeTags: [],
  filterMode: 'OR',
  viewMode: loadViewMode(),
  selectedIds: new Set(),

  selectArtist: (artist) => set({ selectedArtist: artist, selectedIds: new Set() }),

  toggleTag: (field, value) =>
    set((s) => {
      const idx = s.activeTags.findIndex((t) => t.field === field && t.value === value)
      return {
        activeTags:
          idx >= 0
            ? s.activeTags.filter((_, i) => i !== idx)
            : [...s.activeTags, { field, value }],
      }
    }),

  clearFilters: () => set({ activeTags: [] }),
  setFilterMode: (mode) => set({ filterMode: mode }),
  isTagActive: (field, value) =>
    get().activeTags.some((t) => t.field === field && t.value === value),

  setViewMode: (mode) => {
    try { localStorage.setItem('ae-view-mode', mode) } catch { /* ignore */ }
    set({ viewMode: mode, selectedIds: new Set() })
  },

  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedIds: next }
    }),

  setSelectedIds: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
}))
