import { create } from 'zustand'
import { useLibraryStore } from './useLibraryStore'
import { useFolderStore } from './useFolderStore'

export type LibraryRoot = {
  id: number
  name: string
  path: string
  created_at: number
  last_scanned_at: number | null
  status: 'online' | 'offline' | 'missing'
}

export type ScanProgress = { current: number; total: number; file: string }

export type ScanResult = {
  library_root_id: number
  total_folders_found: number
  total_tracks_found: number
  total_files_scanned: number
  total_errors: number
  scan_duration: number
}

type LibraryRootsState = {
  roots: LibraryRoot[]
  scanning: boolean
  scanProgress: ScanProgress | null
  lastScanResult: ScanResult | null

  init: () => Promise<void>
  // Registers rootPath as a durable library root (or reuses the existing
  // registration) and runs a full recursive scan. Safe to call again on the
  // same path later — it's a rescan, not a duplicate import (see
  // ensureLibraryRootTree in db.ts).
  importRoot: (rootPath: string) => Promise<ScanResult>
  stopTracking: (id: number) => Promise<void>
  clearLastScanResult: () => void
}

export const useLibraryRootsStore = create<LibraryRootsState>((set, get) => ({
  roots: [],
  scanning: false,
  scanProgress: null,
  lastScanResult: null,

  init: async () => {
    const roots = await window.api.library.getRoots()
    set({ roots })
  },

  importRoot: async (rootPath) => {
    if (get().scanning) throw new Error('A library scan is already running')
    set({ scanning: true, scanProgress: { current: 0, total: 0, file: '' }, lastScanResult: null })
    const removeListener = window.api.library.onScanProgress((p) => set({ scanProgress: p }))
    try {
      const result = await window.api.library.importRoot(rootPath)
      set({ lastScanResult: result })
      // Scanned tracks land with column_name='Untagged' regardless of their
      // real tags — board placement is recomputed once, in bulk, here,
      // rather than duplicating board-criteria logic into the main process.
      await Promise.all([get().init(), useFolderStore.getState().init(), useLibraryStore.getState().initFromDb()])
      await useLibraryStore.getState().recomputeAllAutoStatuses()
      return result
    } finally {
      removeListener()
      set({ scanning: false, scanProgress: null })
    }
  },

  stopTracking: async (id) => {
    await window.api.library.deleteRoot(id)
    set((s) => ({ roots: s.roots.filter((r) => r.id !== id) }))
  },

  clearLastScanResult: () => set({ lastScanResult: null }),
}))
