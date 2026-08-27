import { useState, useRef } from 'react'
import type { Track } from '../types/track'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useContextMenu } from '../contexts/ContextMenuContext'

export interface TrackCardActions {
  isSelected: boolean
  isCurrentTrack: boolean
  isActive: boolean
  isMissing: boolean
  isRenaming: boolean
  effectiveCol: string
  playerIsPlaying: boolean
  modalOpen: boolean
  setModalOpen: (v: boolean) => void
  moveDdOpen: boolean
  setMoveDdOpen: (v: boolean) => void
  cratePickerOpen: boolean
  setCratePickerOpen: (v: boolean) => void
  crateBtnRef: React.RefObject<HTMLButtonElement | null>
  moveError: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  renameError: string | null
  setRenameError: (v: string | null) => void
  genreEditorOpen: boolean
  setGenreEditorOpen: (v: boolean) => void
  genreError: string | null
  startRename: () => void
  commitRename: () => Promise<void>
  cancelRename: () => void
  handleMoveToFolder: () => Promise<void>
  handleGenreSelect: (newGenre: string) => Promise<void>
  handleToggleSelect: (e: React.MouseEvent) => void
  handleRowClick: () => void
  handleContextMenu: (e: React.MouseEvent) => void
  handlePlayToggle: (e: React.MouseEvent) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  moveTrack: (trackId: number, fromCol: string, toCol: string) => void
  resetTrackStatus: (trackId: number) => Promise<void>
}

// Shared rename/move/genre-edit/context-menu/click-to-Inspector logic,
// extracted out of TrackCard so FolderHierarchyView's tree rows (which
// can't use TrackCard's <tr>-shaped list mode — see Section 3 notes) get
// the exact same capabilities instead of a hand-duplicated copy of them.
// TrackCard still owns its own artwork-src state and dnd-kit board-drag
// wiring — those are presentational/mode-specific, not shared actions.
export function useTrackCardActions(track: Track, col?: string): TrackCardActions {
  const {
    selected, toggleSelect, moveTrack, resetTrackStatus, updateTrack,
    renamingTrackId, setRenamingTrackId, setActiveTrack, activeTrack,
  } = useLibraryStore()
  const { playTrack, currentTrack, isPlaying: playerIsPlaying, togglePlayPause } = usePlayerStore()
  const { openMenu } = useContextMenu()

  const isSelected = selected.has(track.id)
  const isCurrentTrack = currentTrack?.id === track.id
  const isActive = activeTrack?.id === track.id
  const isMissing = track.missing_since != null
  const isRenaming = renamingTrackId === track.id
  const effectiveCol = col ?? track.column_name ?? ''

  const [modalOpen, setModalOpen] = useState(false)
  const [moveDdOpen, setMoveDdOpen] = useState(false)
  const [cratePickerOpen, setCratePickerOpen] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState(track.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [genreEditorOpen, setGenreEditorOpen] = useState(false)
  const [genreError, setGenreError] = useState<string | null>(null)
  const crateBtnRef = useRef<HTMLButtonElement>(null)

  const startRename = (): void => {
    setRenameValue(track.title)
    setRenameError(null)
    setRenamingTrackId(track.id)
  }

  const commitRename = async (): Promise<void> => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenameError('Name cannot be empty'); return }
    if (/[/\\]/.test(trimmed)) { setRenameError('Name cannot contain slashes'); return }
    if (trimmed === track.title) { setRenamingTrackId(null); return }
    const result = await window.api.track.renameFile(track.id, trimmed)
    if (result.ok) {
      void updateTrack(track.id, { filepath: result.newPath, title: result.newTitle })
      setRenamingTrackId(null)
    } else {
      setRenameError(result.error ?? 'Rename failed')
    }
  }

  const cancelRename = (): void => {
    setRenamingTrackId(null)
    setRenameError(null)
  }

  const handleMoveToFolder = async (): Promise<void> => {
    if (!track.filepath) return
    const folder = await window.api.dialog.openFolder()
    if (!folder) return
    try {
      const newPath = await window.api.fs.moveFile(track.filepath, folder)
      void updateTrack(track.id, { filepath: newPath, folder: folder.split('/').pop() })
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : String(err))
      setTimeout(() => setMoveError(null), 3000)
    }
  }

  const handleGenreSelect = async (newGenre: string): Promise<void> => {
    if (!newGenre || newGenre === track.genre) return
    const result = await updateTrack(track.id, { genre: newGenre })
    if (!result.ok) {
      setGenreError(result.error ?? 'Could not update genre')
      setTimeout(() => setGenreError(null), 3000)
    }
  }

  const handleToggleSelect = (e: React.MouseEvent): void => {
    e.stopPropagation()
    toggleSelect(track.id)
  }

  const handleRowClick = (): void => {
    if (moveDdOpen || isRenaming || genreEditorOpen) return
    // TagCloud's "apply to active track" shortcut + the .active row
    // highlight both key off this.
    setActiveTrack(track, effectiveCol)
    setModalOpen(true)
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    openMenu(e.clientX, e.clientY, track, effectiveCol)
  }

  const handlePlayToggle = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (isMissing) return
    if (isCurrentTrack) togglePlayPause()
    else if (track.filepath) playTrack(track)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (modalOpen || isRenaming) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setModalOpen(true)
    }
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      if (isCurrentTrack) togglePlayPause()
      else if (track.filepath) playTrack(track)
    }
  }

  return {
    isSelected, isCurrentTrack, isActive, isMissing, isRenaming, effectiveCol,
    playerIsPlaying,
    modalOpen, setModalOpen,
    moveDdOpen, setMoveDdOpen,
    cratePickerOpen, setCratePickerOpen, crateBtnRef,
    moveError, renameValue, setRenameValue, renameError, setRenameError,
    genreEditorOpen, setGenreEditorOpen, genreError,
    startRename, commitRename, cancelRename,
    handleMoveToFolder, handleGenreSelect, handleToggleSelect,
    handleRowClick, handleContextMenu, handlePlayToggle, handleKeyDown,
    moveTrack, resetTrackStatus,
  }
}
