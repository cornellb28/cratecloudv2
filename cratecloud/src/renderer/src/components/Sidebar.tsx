import { useState, useEffect, useRef, useMemo } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useFolderStore, type FolderNode } from '../stores/useFolderStore'
import type { Crate } from '../types/track'
import { TagCloud } from './TagCloud'
import { BookmarksPanel } from './BookmarksPanel'

type CrateMenuState = { x: number; y: number; crate: Crate } | null

// Same 6-color set the rest of the app already uses for crates/boards
// (CRATE_COLORS[0..5], see types/track.ts) — genres/artists reuse it via a
// simple hash so the same name always lands on the same color across
// sessions, without persisting a color assignment anywhere.
const HASH_COLORS = ['#7f77dd', '#1d9e75', '#378add', '#d85a30', '#ba7517', '#d4537e']

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return HASH_COLORS[Math.abs(hash) % HASH_COLORS.length]
}

function loadOpenState(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function saveOpenState(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // private-browsing/quota failure — just won't persist this session
  }
}

const ARTIST_LETTER_GROUP_THRESHOLD = 20

// ── Folder filter tree (sidebar) ─────────────────────────────────────────────
function SidebarFolderNode({
  folder,
  allFolders,
  activeFolderId,
  trackCountByFolder,
  onSelect,
  depth
}: {
  folder: FolderNode
  allFolders: FolderNode[]
  activeFolderId: number | null
  trackCountByFolder: Map<number, number>
  onSelect: (id: number) => void
  depth: number
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const children = allFolders.filter((f) => f.parent_folder_id === folder.id)
  const isActive = activeFolderId === folder.id
  const count = trackCountByFolder.get(folder.id) ?? 0

  return (
    <div>
      <div
        className={`sb-item${isActive ? ' active' : ''}`}
        style={{ paddingLeft: `calc(var(--space-2) + var(--space-3) * ${depth})` }}
        onClick={() => onSelect(isActive ? -1 : folder.id)}
      >
        {children.length > 0 && (
          <span
            className="sb-folder-arrow"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((x) => !x)
            }}
          >
            {expanded ? '▾' : '▸'}
          </span>
        )}
        {children.length === 0 && <span className="sb-folder-arrow-placeholder" />}
        <span className="sb-item-name">{folder.name}</span>
        {count > 0 && <span className="sb-count">{count}</span>}
      </div>
      {expanded &&
        children.map((child) => (
          <SidebarFolderNode
            key={child.id}
            folder={child}
            allFolders={allFolders}
            activeFolderId={activeFolderId}
            trackCountByFolder={trackCountByFolder}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const {
    crates,
    activeCrateId,
    setActiveCrate,
    activeFolderId,
    setActiveFolder,
    selectedGenre,
    setSelectedGenre,
    selectedArtist,
    setSelectedArtist,
    labelManagerOpen,
    setLabelManagerOpen,
    openCrateDialog,
    openCrateEditDialog,
    allTracks
  } = useLibraryStore()
  const { folders } = useFolderStore()

  const [crateMenu, setCrateMenu] = useState<CrateMenuState>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const tracks = allTracks()
  const totalCount = tracks.length

  // Direct track count per folder — same convention as FolderHierarchyView's
  // trackCountByFolder (computed from the already-loaded library, no IPC
  // round trip; the whole library is resident in memory after the lazy
  // chunked load, so there's nothing to "fetch" per folder).
  const trackCountByFolder = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of tracks) {
      if (t.folder_id == null) continue
      map.set(t.folder_id, (map.get(t.folder_id) ?? 0) + 1)
    }
    return map
  }, [tracks])

  // Header badge counts (distinct genre/artist names) are cheap to derive
  // from the already-loaded library and shown even before first expand;
  // only the per-item list itself is lazily fetched via IPC on first expand.
  const distinctGenreCount = useMemo(() => {
    const set = new Set<string>()
    for (const t of tracks) if (t.genre?.trim()) set.add(t.genre.trim())
    return set.size
  }, [tracks])
  const distinctArtistCount = useMemo(() => {
    const set = new Set<string>()
    for (const t of tracks) if (t.artist?.trim()) set.add(t.artist.trim())
    return set.size
  }, [tracks])

  // ── Genres group ──────────────────────────────────────────────────────────
  const [genresOpen, setGenresOpen] = useState(() =>
    loadOpenState('cratecloud_sidebar_genres_open')
  )
  const [genresLoaded, setGenresLoaded] = useState(false)
  const [genres, setGenres] = useState<{ genre: string; track_count: number }[]>([])

  const toggleGenres = (): void => {
    const next = !genresOpen
    setGenresOpen(next)
    saveOpenState('cratecloud_sidebar_genres_open', next)
    if (next) {
      // Refetch on every open, not just the first — genresLoaded previously
      // gated this permanently after first load, so a genre rename (inline
      // edit, Label Manager) never showed up here until app restart.
      window.api.db
        .allGenres()
        .then((rows) => { setGenres(rows); setGenresLoaded(true) })
        .catch((err) => console.error('[sidebar] allGenres failed:', err))
    }
  }

  // ── Artists group ─────────────────────────────────────────────────────────
  const [artistsOpen, setArtistsOpen] = useState(() =>
    loadOpenState('cratecloud_sidebar_artists_open')
  )
  const [artistsLoaded, setArtistsLoaded] = useState(false)
  const [artists, setArtists] = useState<{ artist: string; track_count: number }[]>([])

  const toggleArtists = (): void => {
    const next = !artistsOpen
    setArtistsOpen(next)
    saveOpenState('cratecloud_sidebar_artists_open', next)
    if (next) {
      // Same fix as toggleGenres — refetch every open, not just the first.
      window.api.db
        .allArtists()
        .then((rows) => { setArtists(rows); setArtistsLoaded(true) })
        .catch((err) => console.error('[sidebar] allArtists failed:', err))
    }
  }

  const artistGroups = useMemo(() => {
    if (artists.length <= ARTIST_LETTER_GROUP_THRESHOLD) return null
    const groups = new Map<string, typeof artists>()
    for (const a of artists) {
      const letter = /[a-z]/i.test(a.artist[0]) ? a.artist[0].toUpperCase() : '#'
      if (!groups.has(letter)) groups.set(letter, [])
      groups.get(letter)!.push(a)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [artists])

  useEffect(() => {
    if (!crateMenu) return
    const dismiss = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setCrateMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCrateMenu(null)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', onKey)
    }
  }, [crateMenu])

  const handleCrateContextMenu = (e: React.MouseEvent, crate: Crate) => {
    e.preventDefault()
    e.stopPropagation()
    setCrateMenu({ x: e.clientX, y: e.clientY, crate })
  }

  return (
    <div className="sidebar">
      {/* All Tracks */}
      <div className="sb-section">Library</div>
      <div
        className={`sb-item${activeCrateId === null && !selectedGenre && !selectedArtist ? ' active' : ''}`}
        onClick={() => setActiveCrate(null)}
      >
        <div className="sb-dot" style={{ background: 'var(--color-text-disabled)' }} />
        All Tracks
        <span className="sb-count">{totalCount}</span>
      </div>

      {/* Genres */}
      <div className="tc-field">
        <div className="tc-field-header" onClick={toggleGenres}>
          <span className="tc-chevron">{genresOpen ? '▾' : '▸'}</span>
          <span className="tc-field-label">Genres</span>
          {distinctGenreCount > 0 && <span className="tc-field-count">{distinctGenreCount}</span>}
        </div>
        {genresOpen && (
          <>
            {genresLoaded && genres.length === 0 && (
              <div className="sb-empty">No genres tagged yet</div>
            )}
            {genres.map((g) => (
              <div
                key={g.genre}
                className={`sb-item${selectedGenre === g.genre ? ' active' : ''}`}
                onClick={() => setSelectedGenre(g.genre)}
                title={g.genre}
              >
                <div className="sb-dot" style={{ background: hashColor(g.genre) }} />
                <span className="sb-item-name">{g.genre}</span>
                <span className="sb-count">{g.track_count}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Artists */}
      <div className="tc-field">
        <div className="tc-field-header" onClick={toggleArtists}>
          <span className="tc-chevron">{artistsOpen ? '▾' : '▸'}</span>
          <span className="tc-field-label">Artists</span>
          {distinctArtistCount > 0 && <span className="tc-field-count">{distinctArtistCount}</span>}
        </div>
        {artistsOpen && (
          <>
            {artistsLoaded && artists.length === 0 && (
              <div className="sb-empty">No artists tagged yet</div>
            )}
            {artistGroups
              ? artistGroups.map(([letter, group]) => (
                  <div key={letter}>
                    <div className="sb-letter-header">{letter}</div>
                    {group.map((a) => (
                      <div
                        key={a.artist}
                        className={`sb-item${selectedArtist === a.artist ? ' active' : ''}`}
                        onClick={() => setSelectedArtist(a.artist)}
                        title={a.artist}
                      >
                        <div className="sb-dot" style={{ background: hashColor(a.artist) }} />
                        <span className="sb-item-name">{a.artist}</span>
                        <span className="sb-count">{a.track_count}</span>
                      </div>
                    ))}
                  </div>
                ))
              : artists.map((a) => (
                  <div
                    key={a.artist}
                    className={`sb-item${selectedArtist === a.artist ? ' active' : ''}`}
                    onClick={() => setSelectedArtist(a.artist)}
                    title={a.artist}
                  >
                    <div className="sb-dot" style={{ background: hashColor(a.artist) }} />
                    <span className="sb-item-name">{a.artist}</span>
                    <span className="sb-count">{a.track_count}</span>
                  </div>
                ))}
          </>
        )}
      </div>

      {/* Crates */}
      <div className="sb-section-row">
        <span className="sb-section">Crates</span>
        <button className="sb-add-btn" onClick={() => openCrateDialog('create')} title="New crate">
          +
        </button>
      </div>

      {crates.length === 0 && <div className="sb-empty">No crates yet</div>}

      {crates.map((c) => (
        <div
          key={c.id}
          className={`sb-item${activeCrateId === c.id ? ' active' : ''}`}
          onClick={() => setActiveCrate(c.id)}
          onContextMenu={(e) => handleCrateContextMenu(e, c)}
        >
          <div className="sb-dot" style={{ background: c.color }} />
          <span className="sb-item-name">{c.name}</span>
          <span className="sb-count">{c.trackIds.size}</span>
        </div>
      ))}

      {/* Folder filter tree */}
      {folders.length > 0 && (
        <>
          <div className="sb-section">Folders</div>
          {folders
            .filter((f) => f.parent_folder_id === null)
            .map((root) => (
              <SidebarFolderNode
                key={root.id}
                folder={root}
                allFolders={folders}
                activeFolderId={activeFolderId}
                trackCountByFolder={trackCountByFolder}
                onSelect={(id) => setActiveFolder(id === -1 ? null : id)}
                depth={0}
              />
            ))}
        </>
      )}

      {/* Tools */}
      <div className="sb-section">Tools</div>
      <div
        className={`sb-item${labelManagerOpen ? ' active' : ''}`}
        onClick={() => setLabelManagerOpen(!labelManagerOpen)}
      >
        <div className="sb-dot" style={{ background: 'var(--color-tag-genre-text)' }} />
        Label Manager
      </div>

      {/* Tag cloud */}
      <TagCloud />

      {/* Bookmarks */}
      <BookmarksPanel />

      {/* Inline crate context menu */}
      {crateMenu && (
        <div ref={menuRef} className="ctx-menu" style={{ left: crateMenu.x, top: crateMenu.y }}>
          <div
            className="ctx-item"
            onClick={() => {
              openCrateEditDialog(crateMenu.crate)
              setCrateMenu(null)
            }}
          >
            Edit crate…
          </div>
          <div
            className="ctx-item ctx-danger"
            onClick={() => {
              useLibraryStore.getState().deleteCrate(crateMenu.crate.id)
              setCrateMenu(null)
            }}
          >
            Delete crate
          </div>
        </div>
      )}
    </div>
  )
}
