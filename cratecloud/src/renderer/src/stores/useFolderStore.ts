import { create } from 'zustand'
import { useLibraryStore } from './useLibraryStore'

export type FolderNode = {
  id: number
  name: string
  parent_folder_id: number | null
  created_at: number
  // Absolute on-disk directory, only known for folders created via import.
  // NULL means this folder can't be a drag-move destination — see db.ts FolderRow.
  path: string | null
}

type FolderState = {
  folders: FolderNode[]
  init: () => Promise<void>
  createFolder: (name: string, parentId: number | null) => Promise<number>
  // Like createFolder, but backed by a real directory the DJ picks/creates
  // via the native folder dialog — returns null if they cancel the dialog.
  createFolderOnDisk: (parentId: number | null) => Promise<number | null>
  renameFolder: (id: number, name: string) => Promise<void>
  moveFolder: (id: number, newParentId: number | null) => Promise<void>
  deleteFolder: (id: number) => Promise<void>
  // Returns id + all descendant ids (inclusive)
  allDescendantIds: (id: number) => Set<number>
  isDescendantOf: (folderId: number, potentialAncestorId: number) => boolean
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],

  init: async () => {
    const rows = await window.api.folders.getAll()
    set({ folders: rows })
  },

  createFolder: async (name, parentId) => {
    const id = await window.api.folders.insert(name, parentId)
    set((s) => ({
      folders: [...s.folders, { id, name, parent_folder_id: parentId, created_at: Math.floor(Date.now() / 1000), path: null }],
    }))
    return id
  },

  createFolderOnDisk: async (parentId) => {
    const result = await window.api.folders.createOnDisk(parentId)
    if (result.canceled) return null
    if (!result.success) throw new Error(result.error ?? 'Could not create folder')
    const { id, name, path } = result as { id: number; name: string; path: string }
    set((s) => ({
      folders: [...s.folders, { id, name, parent_folder_id: parentId, created_at: Math.floor(Date.now() / 1000), path }],
    }))
    return id
  },

  renameFolder: async (id, name) => {
    const result = await window.api.folders.rename(id, name)
    if (!result.success) throw new Error(result.error ?? 'Rename failed')
    // A rename with a known disk path can cascade path/filepath changes
    // across every nested folder and track — re-sync both from the DB
    // rather than trying to surgically patch local state for a cascade.
    await get().init()
    await useLibraryStore.getState().initFromDb()
  },

  moveFolder: async (id, newParentId) => {
    // Cycle guard: refuse to move a folder into its own descendant
    if (newParentId !== null && get().isDescendantOf(newParentId, id)) return
    const result = await window.api.folders.move(id, newParentId)
    if (!result.success) throw new Error(result.error ?? 'Move failed')
    await get().init()
    await useLibraryStore.getState().initFromDb()
  },

  deleteFolder: async (id) => {
    await window.api.folders.delete(id)
    // Cascade: also remove all descendants from local state (DB handles it via ON DELETE CASCADE)
    const descendants = get().allDescendantIds(id)
    set((s) => ({ folders: s.folders.filter((f) => !descendants.has(f.id)) }))
  },

  allDescendantIds: (id) => {
    const { folders } = get()
    const result = new Set<number>([id])
    const addChildren = (parentId: number) => {
      for (const f of folders) {
        if (f.parent_folder_id === parentId) {
          result.add(f.id)
          addChildren(f.id)
        }
      }
    }
    addChildren(id)
    return result
  },

  isDescendantOf: (folderId, potentialAncestorId) => {
    const { folders } = get()
    let current = folders.find((f) => f.id === folderId)
    while (current) {
      if (current.parent_folder_id === potentialAncestorId) return true
      current = folders.find((f) => f.id === current!.parent_folder_id) ?? undefined
    }
    return false
  },
}))
