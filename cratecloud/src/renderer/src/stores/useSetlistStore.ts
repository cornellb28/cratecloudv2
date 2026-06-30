import { create } from 'zustand'

export type SetlistEntry = {
  id: number
  name: string
  created_at: number
  trackIds: number[]
}

type ExportResult = { success: boolean; seratoDetected: boolean; path?: string; error?: string }

type SetlistStore = {
  setlists: SetlistEntry[]
  activeId: number | null
  init: () => Promise<void>
  setActiveId: (id: number | null) => void
  createSetlist: (name: string) => Promise<void>
  renameSetlist: (id: number, name: string) => Promise<void>
  deleteSetlist: (id: number) => Promise<void>
  addTrack: (setlistId: number, trackId: number) => Promise<void>
  removeTrack: (setlistId: number, trackId: number) => Promise<void>
  reorder: (setlistId: number, trackIds: number[]) => Promise<void>
  exportToSerato: (setlistId: number, name: string) => Promise<ExportResult>
}

export const useSetlistStore = create<SetlistStore>((set, get) => ({
  setlists: [],
  activeId: null,

  init: async () => {
    const rows = await window.api.setlist.getAll()
    const setlists = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        trackIds: await window.api.setlist.getTrackIds(r.id),
      }))
    )
    set({ setlists })
  },

  setActiveId: (id) => set({ activeId: id }),

  createSetlist: async (name) => {
    const id = await window.api.setlist.create(name)
    set((s) => ({
      setlists: [...s.setlists, { id, name, created_at: Math.floor(Date.now() / 1000), trackIds: [] }],
      activeId: id,
    }))
  },

  renameSetlist: async (id, name) => {
    await window.api.setlist.rename(id, name)
    set((s) => ({
      setlists: s.setlists.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
    }))
  },

  deleteSetlist: async (id) => {
    await window.api.setlist.delete(id)
    set((s) => ({
      setlists: s.setlists.filter((sl) => sl.id !== id),
      activeId: s.activeId === id ? (s.setlists.find((sl) => sl.id !== id)?.id ?? null) : s.activeId,
    }))
  },

  addTrack: async (setlistId, trackId) => {
    await window.api.setlist.addTrack(setlistId, trackId)
    set((s) => ({
      setlists: s.setlists.map((sl) =>
        sl.id === setlistId && !sl.trackIds.includes(trackId)
          ? { ...sl, trackIds: [...sl.trackIds, trackId] }
          : sl
      ),
    }))
  },

  removeTrack: async (setlistId, trackId) => {
    await window.api.setlist.removeTrack(setlistId, trackId)
    set((s) => ({
      setlists: s.setlists.map((sl) =>
        sl.id === setlistId
          ? { ...sl, trackIds: sl.trackIds.filter((id) => id !== trackId) }
          : sl
      ),
    }))
  },

  reorder: async (setlistId, trackIds) => {
    await window.api.setlist.reorder(setlistId, trackIds)
    set((s) => ({
      setlists: s.setlists.map((sl) =>
        sl.id === setlistId ? { ...sl, trackIds } : sl
      ),
    }))
  },

  exportToSerato: (setlistId, name) => window.api.setlist.exportSerato(setlistId, name),
}))
