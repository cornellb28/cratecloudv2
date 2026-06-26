import { create } from 'zustand'
import type { Track, Setlist } from '../types/track'

// Mirrors db.ts DbTrackRow — keep in sync
type DbTrackRow = {
  id: number; title: string; artist: string; bpm: string; key_val: string
  genre: string; energy: string; column_name: string; folder: string | null
  filepath: string | null; camelot: string | null; openkey: string | null
  duration_str: string | null; duration_sec: number | null
  file_size_mb: number | null; format: string | null
  album: string | null; year: string | null; waveform: string | null
}

export type ImportedTrackData = {
  success: boolean
  filepath: string
  filename?: string
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
  searchQuery: string
  deleteDialog: { trackIds: number[] } | null
  deletePreference: DeletePreference
  importStatus: { current: number; total: number; label: string } | null
  dbReady: boolean

  initFromDb: () => Promise<void>
  setActiveTab: (tab: string) => void
  setSearchQuery: (q: string) => void
  toggleSelect: (id: number) => void
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
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  columns: { ...EMPTY_COLUMNS },
  setlists: [],
  selectedSetlistId: null,
  selected: new Set(),
  activeTrack: null,
  activeTrackCol: null,
  activeTab: 'Library',
  searchQuery: '',
  deleteDialog: null,
  deletePreference: 'ask',
  importStatus: null,
  dbReady: false,

  initFromDb: async () => {
    try {
      const rows = await window.api.db.getTracks()
      const columns: Record<string, Track[]> = { ...EMPTY_COLUMNS }
      for (const col of Object.keys(columns)) {
        columns[col] = []
      }
      rows.forEach((row) => {
        const track = rowToTrack(row)
        const col = columns[row.column_name] ?? columns['Untagged']
        col.push(track)
      })
      set({ columns, dbReady: true })
    } catch (err) {
      console.error('[db] initFromDb failed:', err)
      set({ dbReady: true })
    }
  },

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
        waveform: r.waveform ? JSON.stringify(r.waveform) : null,
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
}))
