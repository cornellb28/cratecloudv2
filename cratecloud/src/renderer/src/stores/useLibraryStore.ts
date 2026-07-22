import { create } from 'zustand'
import type { Track, Setlist, Crate, Board } from '../types/track'
import { type AdvancedFilters, DEFAULT_ADVANCED_FILTERS, type ActiveTagFilter } from '../utils/searchFilter'

// Mirrors db.ts DbTrackRow — keep in sync
type DbTrackRow = {
  id: number; title: string; artist: string; bpm: string; key_val: string
  genre: string; energy: string; column_name: string; status_is_manual: number
  folder: string | null; folder_id: number | null
  filepath: string | null; camelot: string | null; openkey: string | null
  duration_str: string | null; duration_sec: number | null
  file_size_mb: number | null; format: string | null
  album: string | null; year: string | null
  remixer: string | null; grouping: string | null; composer: string | null
  comment: string | null; label: string | null
  waveform: string | null
  artwork_path: string | null
  created_at: number | null
}

// ── computeStatus ─────────────────────────────────────────────────────────────
// Pure function. Evaluates a track against board criteria (highest position first)
// and returns the name of the board it should belong to.
// Uses Track property names in criteria (e.g. "key" not "key_val").
export function computeStatus(track: Partial<Track>, boards: Board[]): string {
  const sorted = [...boards]
    .filter((b) => b.criteria !== null)
    .sort((a, b) => b.position - a.position)

  for (const board of sorted) {
    const c = board.criteria!
    if (c.length === 0) continue // fallback — skip, handle at end
    const met = c.every((field) => {
      const val = track[field as keyof Track]
      return typeof val === 'string' ? val.trim() !== '' : !!val
    })
    if (met) return board.name
  }

  // Fallback: first board with criteria = [] (Untagged)
  const fallback = sorted.find((b) => b.criteria!.length === 0)
  return fallback?.name ?? boards.at(-1)?.name ?? 'Untagged'
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
  folder_id?: number | null
  relative_dir?: string
}

export type DeletePreference = 'ask' | 'remove' | 'trash'

const EMPTY_COLUMNS: Record<string, Track[]> = {}

function rowToTrack(row: DbTrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    key: row.key_val,
    genre: row.genre,
    energy: row.energy,
    status_is_manual: row.status_is_manual === 1,
    folder: row.folder ?? undefined,
    folder_id: row.folder_id ?? undefined,
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
    created_at: row.created_at,
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
  activeFolderId: number | null
  boards: Board[]
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
  setActiveFolder: (id: number | null) => void
  setTrackFolder: (trackId: number, folderId: number | null) => Promise<void>
  createBoard: (name: string, color: string) => Promise<void>
  renameBoard: (id: number, oldName: string, newName: string) => Promise<void>
  reorderBoards: (order: { id: number; position: number }[]) => Promise<void>
  updateBoardColor: (id: number, color: string) => Promise<void>
  updateBoardCriteria: (id: number, criteria: string[] | null) => Promise<void>
  deleteBoard: (id: number, fallbackName: string) => Promise<void>
  resetTrackStatus: (trackId: number) => Promise<void>
  recomputeAllAutoStatuses: () => Promise<void>
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
  activeFolderId: null,
  boards: [],
  crateDialog: null,

  initFromDb: async () => {
    try {
      const [rows, crateRows, crateTrackRows, boardRows] = await Promise.all([
        window.api.db.getTracks(),
        window.api.crate.getAll(),
        window.api.crate.getAllTrackIds(),
        window.api.board.getAll(),
      ])
      // Build columns keyed by board name in position order; parse criteria JSON
      const sortedBoards: Board[] = [...boardRows]
        .sort((a, b) => a.position - b.position)
        .map((b) => ({
          ...b,
          criteria: b.criteria != null ? (JSON.parse(b.criteria as unknown as string) as string[]) : null,
        }))
      const columns: Record<string, Track[]> = {}
      for (const b of sortedBoards) columns[b.name] = []
      const firstBoardName = sortedBoards[0]?.name ?? 'Untagged'
      rows.forEach((row) => {
        const track = rowToTrack(row)
        if (columns[row.column_name]) columns[row.column_name].push(track)
        else if (columns[firstBoardName]) columns[firstBoardName].push(track)
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
      set({ columns, crates, boards: sortedBoards, dbReady: true })
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
    const pinned = { ...track, status_is_manual: true }
    columns[fromCol] = columns[fromCol].filter((t) => t.id !== trackId)
    columns[toCol] = [...columns[toCol], pinned]
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
          updated[targetCol] = [...updated[targetCol], { ...track, status_is_manual: true }]
        }
      })
    })
    set({ columns: updated, selected: new Set() })
    window.api.db.moveTracks([...selected], targetCol).catch(console.error)
  },

  updateTrack: (id, updates) => {
    const { boards } = get()
    const columns = { ...get().columns }
    let updatedTrack: Track | undefined
    let currentCol = ''

    Object.keys(columns).forEach((col) => {
      columns[col] = columns[col].map((t) => {
        if (t.id === id) {
          updatedTrack = { ...t, ...updates }
          currentCol = col
          return updatedTrack
        }
        return t
      })
    })

    const activeTrack = get().activeTrack

    // Auto-recompute board placement if not manually pinned
    if (updatedTrack && currentCol && !updatedTrack.status_is_manual) {
      const targetCol = computeStatus(updatedTrack, boards)
      if (targetCol && targetCol !== currentCol && columns[targetCol] !== undefined) {
        const moved = updatedTrack
        columns[currentCol] = columns[currentCol].filter((t) => t.id !== id)
        columns[targetCol] = [...columns[targetCol], moved]
        window.api.db.autoMoveTracks([id], targetCol).catch(console.error)
      }
    }

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
    const boards = get().boards

    const rows = validResults.map((r) => {
      const bpm = r.bpm != null ? String(Math.round(r.bpm)) : ''
      const key_val = r.camelot ?? ''
      const energy = r.energy != null ? String(Math.min(10, Math.round(r.energy * 10))) : ''
      const tempTrack: Partial<Track> = {
        bpm,
        key: key_val,
        genre: r.genre ?? '',
        energy,
        artist: r.artist ?? '',
        year: r.year ?? '',
      }
      const column_name = boards.length ? computeStatus(tempTrack, boards) : (bpm && key_val ? 'Tagged' : 'Untagged')
      return {
        title: r.title ?? r.filename ?? 'Unknown',
        artist: r.artist ?? '',
        bpm,
        key_val,
        genre: r.genre ?? '',
        energy,
        column_name,
        folder: folderName ?? null,
        folder_id: r.folder_id ?? null,
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

    const buckets: Record<string, Track[]> = {}

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
        folder_id: row.folder_id ?? undefined,
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
        // Optimistic local value — the real strftime('%s','now') is set server-side
        // at insert time; this is a same-second approximation for immediate UI display.
        created_at: Math.floor(Date.now() / 1000),
      }
      const dest = row.column_name
      if (!buckets[dest]) buckets[dest] = []
      buckets[dest].push(track)
    })

    const newColumns = { ...columns }
    for (const [dest, tracks] of Object.entries(buckets)) {
      if (newColumns[dest]) newColumns[dest] = [...newColumns[dest], ...tracks]
    }
    set({ columns: newColumns })
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
  setActiveFolder: (id) => set({ activeFolderId: id }),

  setTrackFolder: async (trackId, folderId) => {
    await window.api.folders.updateTrackFolders([{ trackId, folderId }])
    const columns = { ...get().columns }
    Object.keys(columns).forEach((col) => {
      columns[col] = columns[col].map((t) =>
        t.id === trackId ? { ...t, folder_id: folderId ?? undefined } : t
      )
    })
    set({ columns })
  },

  createBoard: async (name, color) => {
    const { boards } = get()
    const position = boards.length
    const id = await window.api.board.insert(name, color, position)
    const newBoard: Board = { id, name, color, position, created_at: Math.floor(Date.now() / 1000), criteria: null }
    set((s) => ({ boards: [...s.boards, newBoard], columns: { ...s.columns, [name]: [] } }))
  },

  renameBoard: async (id, oldName, newName) => {
    await window.api.board.rename(id, oldName, newName)
    set((s) => {
      const boards = s.boards.map((b) => (b.id === id ? { ...b, name: newName } : b))
      // Rebuild columns with the renamed key in the correct position
      const columns: Record<string, Track[]> = {}
      for (const b of boards) columns[b.name] = b.name === newName ? (s.columns[oldName] ?? []) : (s.columns[b.name] ?? [])
      return { boards, columns }
    })
  },

  reorderBoards: async (order) => {
    await window.api.board.reorder(order)
    set((s) => {
      const posMap = new Map(order.map((e) => [e.id, e.position]))
      const boards = [...s.boards].sort((a, b) => (posMap.get(a.id) ?? a.position) - (posMap.get(b.id) ?? b.position))
        .map((b) => ({ ...b, position: posMap.get(b.id) ?? b.position }))
      // Rebuild columns in new order (preserving track arrays)
      const columns: Record<string, Track[]> = {}
      for (const b of boards) columns[b.name] = s.columns[b.name] ?? []
      return { boards, columns }
    })
  },

  updateBoardColor: async (id, color) => {
    await window.api.board.updateColor(id, color)
    set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, color } : b)) }))
  },

  updateBoardCriteria: async (id, criteria) => {
    await window.api.board.updateCriteria(id, criteria)
    set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, criteria } : b)) }))
  },

  deleteBoard: async (id, fallbackName) => {
    const { boards, columns } = get()
    const board = boards.find((b) => b.id === id)
    if (!board) return
    await window.api.board.delete(id, fallbackName)
    const orphans = columns[board.name] ?? []
    set((s) => {
      const newBoards = s.boards.filter((b) => b.id !== id)
      const newColumns: Record<string, Track[]> = {}
      for (const b of newBoards) {
        newColumns[b.name] = b.name === fallbackName
          ? [...(s.columns[b.name] ?? []), ...orphans]
          : (s.columns[b.name] ?? [])
      }
      return { boards: newBoards, columns: newColumns }
    })
  },

  resetTrackStatus: async (trackId) => {
    await window.api.db.resetTrackStatus(trackId)
    const { boards, columns } = get()
    let currentCol = ''
    let track: Track | undefined
    Object.entries(columns).forEach(([col, tracks]) => {
      const found = tracks.find((t) => t.id === trackId)
      if (found) { currentCol = col; track = found }
    })
    if (!track || !currentCol) return
    const unpinned = { ...track, status_is_manual: false }
    const targetCol = computeStatus(unpinned, boards)
    const newColumns = { ...columns }
    newColumns[currentCol] = newColumns[currentCol].map((t) => t.id === trackId ? unpinned : t)
    if (targetCol && targetCol !== currentCol && newColumns[targetCol] !== undefined) {
      newColumns[currentCol] = newColumns[currentCol].filter((t) => t.id !== trackId)
      newColumns[targetCol] = [...newColumns[targetCol], unpinned]
      await window.api.db.autoMoveTracks([trackId], targetCol)
    }
    set({ columns: newColumns })
  },

  recomputeAllAutoStatuses: async () => {
    const { columns, boards } = get()
    const toMove: { id: number; from: string; to: string }[] = []
    Object.entries(columns).forEach(([col, tracks]) => {
      tracks.forEach((track) => {
        if (track.status_is_manual) return
        const target = computeStatus(track, boards)
        if (target && target !== col && columns[target] !== undefined) {
          toMove.push({ id: track.id, from: col, to: target })
        }
      })
    })
    if (!toMove.length) return
    // Group by target column and persist
    const byTarget = new Map<string, number[]>()
    for (const { id, to } of toMove) {
      if (!byTarget.has(to)) byTarget.set(to, [])
      byTarget.get(to)!.push(id)
    }
    await Promise.all([...byTarget].map(([col, ids]) => window.api.db.autoMoveTracks(ids, col)))
    // Update in-memory state
    const moved = new Map(toMove.map(({ id, from, to }) => [id, { from, to }]))
    const newColumns: Record<string, Track[]> = {}
    Object.keys(columns).forEach((col) => { newColumns[col] = [] })
    Object.entries(columns).forEach(([col, tracks]) => {
      tracks.forEach((track) => {
        const mv = moved.get(track.id)
        const dest = mv ? mv.to : col
        newColumns[dest] = [...(newColumns[dest] ?? []), track]
      })
    })
    set({ columns: newColumns })
  },

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
