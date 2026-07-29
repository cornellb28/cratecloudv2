import { create } from 'zustand'

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

  renameFolder: async (id, name) => {
    await window.api.folders.rename(id, name)
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }))
  },

  moveFolder: async (id, newParentId) => {
    // Cycle guard: refuse to move a folder into its own descendant
    if (newParentId !== null && get().isDescendantOf(newParentId, id)) return
    await window.api.folders.move(id, newParentId)
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, parent_folder_id: newParentId } : f)),
    }))
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
