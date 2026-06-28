import { create } from 'zustand'

export const TAG_FIELDS = ['genre', 'comment', 'remixer', 'label', 'grouping', 'composer'] as const
export type TagField = (typeof TAG_FIELDS)[number]

export const TAG_FIELD_LABELS: Record<TagField, string> = {
  genre: 'Genre',
  comment: 'Comment',
  remixer: 'Remixer',
  label: 'Label',
  grouping: 'Grouping',
  composer: 'Composer',
}

export type Tag = {
  id: number
  field: TagField
  value: string
  color: string
}

type TagState = {
  tags: Tag[]
  init: () => Promise<void>
  addTag: (field: TagField, value: string, color: string) => Promise<void>
  removeTag: (id: number) => Promise<void>
  updateTag: (id: number, value: string, color: string) => Promise<void>
  tagsForField: (field: TagField) => Tag[]
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],

  init: async () => {
    const rows = await window.api.tags.getAll()
    set({ tags: rows as Tag[] })
  },

  addTag: async (field, value, color) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const existing = get().tags.find(
      (t) => t.field === field && t.value.toLowerCase() === trimmed.toLowerCase()
    )
    if (existing) return
    const id = await window.api.tags.insert(field, trimmed, color)
    if (id < 0) return
    set((s) => ({ tags: [...s.tags, { id, field, value: trimmed, color }] }))
  },

  removeTag: async (id) => {
    await window.api.tags.delete(id)
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }))
  },

  updateTag: async (id, value, color) => {
    const trimmed = value.trim()
    if (!trimmed) return
    await window.api.tags.update(id, trimmed, color)
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, value: trimmed, color } : t)),
    }))
  },

  tagsForField: (field) => get().tags.filter((t) => t.field === field),
}))
