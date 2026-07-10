import { create } from 'zustand'

export type Bookmark = { id: number; url: string; label: string; created_at: number }

type BookmarkState = {
  bookmarks: Bookmark[]
  init: () => Promise<void>
  addBookmark: (url: string, label: string) => Promise<void>
  removeBookmark: (id: number) => Promise<void>
  updateBookmark: (id: number, url: string, label: string) => Promise<void>
  openBookmark: (url: string) => Promise<void>
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],

  init: async () => {
    const rows = await window.api.bookmarks.getAll()
    set({ bookmarks: rows })
  },

  addBookmark: async (url, label) => {
    const id = await window.api.bookmarks.insert(url, label.trim())
    const now = Math.floor(Date.now() / 1000)
    set((s) => ({ bookmarks: [{ id, url, label: label.trim(), created_at: now }, ...s.bookmarks] }))
  },

  removeBookmark: async (id) => {
    await window.api.bookmarks.delete(id)
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }))
  },

  updateBookmark: async (id, url, label) => {
    await window.api.bookmarks.update(id, url, label.trim())
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, url, label: label.trim() } : b)),
    }))
  },

  openBookmark: async (url) => {
    await window.api.bookmarks.open(url)
    get() // keep reference stable
  },
}))
