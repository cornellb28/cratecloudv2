import type { Track } from '../types/track'

// Shared by GenreView and ArtistView — both are otherwise-identical
// "browse tracks by X" views with independent DB-backed pagination.
// Pure logic only — see browsePlaceholders.tsx for the shared components
// (kept in a separate file so this one stays Fast-Refresh-safe).

export const HASH_COLORS = ['#7f77dd', '#1d9e75', '#378add', '#d85a30', '#ba7517', '#d4537e']

export function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return HASH_COLORS[Math.abs(hash) % HASH_COLORS.length]
}

export type ViewMode = 'list' | 'board' | 'grid'
export type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'energy' | 'created_at'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'bpm', label: 'BPM' },
  { value: 'key', label: 'Key' },
  { value: 'energy', label: 'Energy' },
  { value: 'created_at', label: 'Date added' }
]

export function sortTracks(tracks: Track[], sortBy: SortKey): Track[] {
  const sorted = [...tracks]
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title)
      case 'artist':
        return (a.artist || '').localeCompare(b.artist || '')
      case 'bpm':
        return (parseFloat(a.bpm) || 0) - (parseFloat(b.bpm) || 0)
      case 'key':
        return (a.key || '').localeCompare(b.key || '')
      case 'energy':
        return (parseFloat(a.energy) || 0) - (parseFloat(b.energy) || 0)
      case 'created_at':
        return (b.created_at ?? 0) - (a.created_at ?? 0)
    }
  })
  return sorted
}
