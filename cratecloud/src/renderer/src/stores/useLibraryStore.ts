import { create } from 'zustand'
import type { Track, Setlist, Crate } from '../types/track'
import { type AdvancedFilters, DEFAULT_ADVANCED_FILTERS, type ActiveTagFilter } from '../utils/searchFilter'

// Mirrors db.ts DbTrackRow — keep in sync
type DbTrackRow = {
  id: number; title: string; artist: string; bpm: string; key_val: string
  genre: string; energy: string; column_name: string; folder: string | null
  filepath: string | null; camelot: string | null; openkey: string | null
  duration_str: string | null; duration_sec: number | null
  file_size_mb: number | null; format: string | null
  album: string | null; year: string | null
  remixer: string | null; grouping: string | null; composer: string | null
  comment: string | null; label: string | null
  waveform: string | null
  artwork_path: string | null
}

export type ImportedTrackData = {
  success: boolean
  filepath: string
  filename?: string
  artwork_path?: string | null
  title?: string | null
  artist?: string | null
  bpm?: number
  camelot?: string
  openkey?: string
  genre?: string | null
  energy?: number
  duration_str?: string
  duration_sec?: number
  waveform?: number[]
  file_size_mb?: number
  format?: string
  album?: string | null
  year?: string | null
  remixer?: string | null
  grouping?: string | null
  composer?: string | null
  comment?: string | null
  label?: string | null
}

export type DeletePreference = 'ask' | 'remove' | 'trash'

const EMPTY_COLUMNS: Record<string, Track[]> = {
  Untagged: [],
  Tagged: [],
  'Crate ready': [],
  'Gig ready': [],
}

function rowToTrack(row: DbTrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    key: row.key_val,
    genre: row.genre,
    energy: row.energy,
    folder: row.folder ?? undefined,
    filepath: row.filepath ?? undefined,
    camelot: row.camelot ?? undefined,
    openkey: row.openkey ?? undefined,
    duration_str: row.duration_str ?? undefined,
    duration_sec: row.duration_sec ?? undefined,
    waveform: row.waveform ? (JSON.parse(row.waveform) as number[]) : undefined,
    file_size_mb: row.file_size_mb ?? undefined,
    format: row.format ?? undefined,
    album: row.album ?? undefined,
    year: row.year ?? undefined,
    remixer: row.remixer ?? undefined,
    grouping: row.grouping ?? undefined,
    composer: row.composer ?? undefined,
    comment: row.comment ?? undefined,
    label: row.label ?? undefined,
    artwork_path: row.artwork_path ?? undefined,
  }
}

type LibraryState = {
  columns: Record<string, Track[]>
  setlists: Setlist[]
  selectedSetlistId: string | null
  selected: Set<number>
  activeTrack: Track | null
  activeTrackCol: string | null
  activeTab: string
  activeView: string
  searchQuery: string
  activeFilter: string
  advancedFilters: AdvancedFilters
  activeTagFilters: ActiveTagFilter[]
  audioPort: number
  deleteDialog: { trackIds: number[] } | null
  deletePreference: DeletePreference
  importStatus: { current: number; total: number; label: string } | null
  dbReady: boolean
  editDialog: { track: Track; col: string } | null
  crates: Crate[]
  activeCrateId: number | null
  crateDialog: { mode: 'create' } | { mode: 'edit'; crate: Crate } | null

  initFromDb: () => Promise<void>
  setActiveTab: (tab: string) => void
  setActiveView: (v: string) => void
  setSearchQuery: (q: string) => void
  setActiveFilter: (f: string) => void
  setAdvancedFilter: (key: keyof AdvancedFilters, value: string) => void
  clearAdvancedFilters: () => void
  toggleTagFilter: (tag: ActiveTagFilter) => void
  clearTagFilters: () => void
  setAudioPort: (port: number) => void
  toggleSelect: (id: number) => void
  selectTracks: (ids: number[]) => void
  clearSelection: () => void
  moveTrack: (trackId: number, fromCol: string, toCol: string) => void
  bulkMove: (targetCol: string) => void
  updateTrack: (id: number, updates: Partial<Track>) => void
  setActiveTrack: (track: Track | null, col: string | null) => void
  addTracks: (results: ImportedTrackData[], folderName?: string) => Promise<void>
  setSelectedSetlist: (id: string | null) => void
  allTracks: () => Track[]
  removeTrack: (id: number) => void
  removeTracks: (ids: number[]) => void
  openDeleteDialog: (ids: number | number[]) => void
  closeDeleteDialog: () => void
  setDeletePreference: (pref: DeletePreference) => void
  setImportStatus: (s: { current: number; total: number; label: string } | null) => void
  openEditDialog: (track: Track, col: string) => void
  closeEditDialog: () => void
  setActiveCrate: (id: number | null) => void
  openCrateDialog: (mode: 'create') => void
  openCrateEditDialog: (crate: Crate) => void
  closeCrateDialog: () => void
  createCrate: (name: string, color: string) => Promise<void>
  updateCrate: (id: number, name: string, color: string) => Promise<void>
  deleteCrate: (id: number) => Promise<void>
  addTracksToCrate: (crateId: number, trackIds: number[]) => Promise<void>
  removeTracksFromCrate: (crateId: number, trackIds: number[]) => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  columns: { ...EMPTY_COLUMNS },
  setlists: [],
  selectedSetlistId: null,
  selected: new Set(),
  activeTrack: null,
  activeTrackCol: null,
  activeTab: 'Library',
  activeView: 'Board',
  searchQuery: '',
  activeFilter: 'All',
  advancedFilters: { ...DEFAULT_ADVANCED_FILTERS },
  activeTagFilters: [],
  audioPort: 0,
  deleteDialog: null,
  deletePreference: 'ask',
  importStatus: null,
  dbReady: false,
  editDialog: null,
  crates: [],
  activeCrateId: null,
  crateDialog: null,

  initFromDb: async () => {
    try {
      const [rows, crateRows, crateTrackRows] = await Promise.all([
        window.api.db.getTracks(),
        window.api.crate.getAll(),
        window.api.crate.getAllTrackIds(),
      ])
      const columns: Record<string, Track[]> = { ...EMPTY_COLUMNS }
      for (const col of Object.keys(columns)) columns[col] = []
      rows.forEach((row) => {
        const track = rowToTrack(row)
        const col = columns[row.column_name] ?? columns['Untagged']
        col.push(track)
      })
      // Build crate trackId Sets
      const trackIdsByCrate = new Map<number, Set<number>>()
      for (const { crate_id, track_id } of crateTrackRows) {
        if (!trackIdsByCrate.has(crate_id)) trackIdsByCrate.set(crate_id, new Set())
        trackIdsByCrate.get(crate_id)!.add(track_id)
      }
      const crates: Crate[] = crateRows.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        trackIds: trackIdsByCrate.get(c.id) ?? new Set(),
      }))
      set({ columns, crates, dbReady: true })
    } catch (err) {
      console.error('[db] initFromDb failed:', err)
      set({ dbReady: true })
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveView: (v) => set({ activeView: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveFilter: (f) => set({ activeFilter: f }),
  setAdvancedFilter: (key, value) =>
    set((s) => ({ advancedFilters: { ...s.advancedFilters, [key]: value } })),
  clearAdvancedFilters: () => set({ advancedFilters: { ...DEFAULT_ADVANCED_FILTERS } }),
  toggleTagFilter: (tag) =>
    set((s) => {
      const already = s.activeTagFilters.findIndex((f) => f.id === tag.id)
      return {
        activeTagFilters: already >= 0
          ? s.activeTagFilters.filter((_, i) => i !== already)
          : [...s.activeTagFilters, tag],
      }
    }),
  clearTagFilters: () => set({ activeTagFilters: [] }),
  setAudioPort: (port) => set({ audioPort: port }),

  toggleSelect: (id) => {
    const selected = new Set(get().selected)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    set({ selected })
  },

  selectTracks: (ids) => set({ selected: new Set(ids) }),
  clearSelection: () => set({ selected: new Set() }),

  moveTrack: (trackId, fromCol, toCol) => {
    if (fromCol === toCol) return
    const columns = { ...get().columns }
    const track = columns[fromCol]?.find((t) => t.id === trackId)
    if (!track) return
    columns[fromCol] = columns[fromCol].filter((t) => t.id !== trackId)
    columns[toCol] = [...columns[toCol], track]
    set({ columns: { ...columns } })
    window.api.db.moveTracks([trackId], toCol).catch(console.error)
  },

  bulkMove: (targetCol) => {
    const { selected, columns } = get()
    const updated: Record<string, Track[]> = {}
    Object.keys(columns).forEach((col) => { updated[col] = [...columns[col]] })
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
    window.api.db.moveTracks([...selected], targetCol).catch(console.error)
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
    // Map Track.key → key_val for DB
    const dbFields: Record<string, unknown> = { ...updates }
    if ('key' in updates) {
      dbFields['key_val'] = updates.key
      delete dbFields['key']
    }
    window.api.db.updateTrack(id, dbFields).catch(console.error)
  },

  setActiveTrack: (track, col) => set({ activeTrack: track, activeTrackCol: col }),

  addTracks: async (results, folderName) => {
    const validResults = results.filter((r) => r.success)
    if (!validResults.length) return

    const { columns } = get()

    const rows = validResults.map((r) => {
      const bpm = r.bpm != null ? String(Math.round(r.bpm)) : ''
      const key_val = r.camelot ?? ''
      const energy = r.energy != null ? String(Math.min(10, Math.round(r.energy * 10))) : ''
      const column_name = bpm && key_val ? 'Tagged' : 'Untagged'
      return {
        title: r.title ?? r.filename ?? 'Unknown',
        artist: r.artist ?? '',
        bpm,
        key_val,
        genre: r.genre ?? '',
        energy,
        column_name,
        folder: folderName ?? null,
        filepath: r.filepath ?? null,
        camelot: r.camelot ?? null,
        openkey: r.openkey ?? null,
        duration_str: r.duration_str ?? null,
        duration_sec: r.duration_sec ?? null,
        file_size_mb: r.file_size_mb ?? null,
        format: r.format ?? null,
        album: r.album ?? null,
        year: r.year ?? null,
        remixer: r.remixer ?? '',
        grouping: r.grouping ?? '',
        composer: r.composer ?? '',
        comment: r.comment ?? '',
        label: r.label ?? '',
        waveform: r.waveform ? JSON.stringify(r.waveform) : null,
        artwork_path: r.artwork_path ?? null,
      }
    })

    let ids: number[]
    try {
      ids = await window.api.db.insertTracks(rows)
    } catch (err) {
      console.error('[db] insertTracks failed:', err)
      return
    }

    const tagged: Track[] = []
    const untagged: Track[] = []

    rows.forEach((row, i) => {
      const track: Track = {
        id: ids[i],
        title: row.title,
        artist: row.artist,
        bpm: row.bpm,
        key: row.key_val,
        genre: row.genre,
        energy: row.energy,
        folder: row.folder ?? undefined,
        filepath: row.filepath ?? undefined,
        camelot: row.camelot ?? undefined,
        openkey: row.openkey ?? undefined,
        duration_str: row.duration_str ?? undefined,
        duration_sec: row.duration_sec ?? undefined,
        waveform: row.waveform ? (JSON.parse(row.waveform) as number[]) : undefined,
        file_size_mb: row.file_size_mb ?? undefined,
        format: row.format ?? undefined,
        album: row.album ?? undefined,
        year: row.year ?? undefined,
        remixer: row.remixer ?? undefined,
        grouping: row.grouping ?? undefined,
        composer: row.composer ?? undefined,
        comment: row.comment ?? undefined,
        label: row.label ?? undefined,
        artwork_path: row.artwork_path ?? undefined,
      }
      if (row.column_name === 'Tagged') tagged.push(track)
      else untagged.push(track)
    })

    set({
      columns: {
        ...columns,
        Untagged: [...columns.Untagged, ...untagged],
        Tagged: [...columns.Tagged, ...tagged],
        'Crate ready': columns['Crate ready'],
        'Gig ready': columns['Gig ready'],
      },
    })
  },

  setSelectedSetlist: (id) => set({ selectedSetlistId: id }),

  allTracks: () => Object.values(get().columns).flat(),

  removeTrack: (id) => {
    const columns = { ...get().columns }
    Object.keys(columns).forEach((col) => {
      columns[col] = columns[col].filter((t) => t.id !== id)
    })
    const activeTrack = get().activeTrack
    set({ columns, activeTrack: activeTrack?.id === id ? null : activeTrack })
    window.api.db.deleteTracks([id]).catch(console.error)
  },

  removeTracks: (ids) => {
    const idSet = new Set(ids)
    const columns = { ...get().columns }
    Object.keys(columns).forEach((col) => {
      columns[col] = columns[col].filter((t) => !idSet.has(t.id))
    })
    const activeTrack = get().activeTrack
    set({
      columns,
      selected: new Set(),
      activeTrack: activeTrack && idSet.has(activeTrack.id) ? null : activeTrack,
    })
    window.api.db.deleteTracks(ids).catch(console.error)
  },

  openDeleteDialog: (ids) =>
    set({ deleteDialog: { trackIds: Array.isArray(ids) ? ids : [ids] } }),

  closeDeleteDialog: () => set({ deleteDialog: null }),

  setDeletePreference: (pref) => set({ deletePreference: pref }),

  setImportStatus: (s) => set({ importStatus: s }),

  openEditDialog: (track, col) => set({ editDialog: { track, col } }),
  closeEditDialog: () => set({ editDialog: null }),

  setActiveCrate: (id) => set({ activeCrateId: id }),
  openCrateDialog: (mode) => set({ crateDialog: { mode } }),
  openCrateEditDialog: (crate) => set({ crateDialog: { mode: 'edit', crate } }),
  closeCrateDialog: () => set({ crateDialog: null }),

  createCrate: async (name, color) => {
    const id = await window.api.crate.insert(name, color)
    set((s) => ({ crates: [...s.crates, { id, name, color, trackIds: new Set() }] }))
  },

  updateCrate: async (id, name, color) => {
    await window.api.crate.update(id, name, color)
    set((s) => ({
      crates: s.crates.map((c) => (c.id === id ? { ...c, name, color } : c)),
    }))
  },

  deleteCrate: async (id) => {
    await window.api.crate.delete(id)
    set((s) => ({
      crates: s.crates.filter((c) => c.id !== id),
      activeCrateId: s.activeCrateId === id ? null : s.activeCrateId,
    }))
  },

  addTracksToCrate: async (crateId, trackIds) => {
    await window.api.crate.addTracks(crateId, trackIds)
    set((s) => ({
      crates: s.crates.map((c) => {
        if (c.id !== crateId) return c
        const next = new Set(c.trackIds)
        trackIds.forEach((id) => next.add(id))
        return { ...c, trackIds: next }
      }),
    }))
  },

  removeTracksFromCrate: async (crateId, trackIds) => {
    await window.api.crate.removeTracks(crateId, trackIds)
    set((s) => ({
      crates: s.crates.map((c) => {
        if (c.id !== crateId) return c
        const next = new Set(c.trackIds)
        trackIds.forEach((id) => next.delete(id))
        return { ...c, trackIds: next }
      }),
    }))
  },
}))
