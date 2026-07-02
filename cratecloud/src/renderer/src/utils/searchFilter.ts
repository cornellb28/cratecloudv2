import type { Track } from '../types/track'

export type AdvancedFilters = {
  bpmMin: string
  bpmMax: string
  energyMin: string
  energyMax: string
  key: string
  format: string
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  bpmMin: '', bpmMax: '', energyMin: '', energyMax: '', key: '', format: '',
}

const FIELD_ALIASES: Record<string, string> = {
  b: 'bpm', e: 'energy', k: 'key', g: 'genre', a: 'artist',
  f: 'format', y: 'year', l: 'label', r: 'remixer',
}

const TEXT_FIELDS: (keyof Track)[] = [
  'title', 'artist', 'genre', 'bpm', 'key', 'energy',
  'album', 'year', 'remixer', 'label', 'comment',
  'composer', 'grouping', 'format', 'camelot', 'openkey',
]

export function parseQuery(raw: string): { terms: string[]; fields: Record<string, string> } {
  const fields: Record<string, string> = {}
  const rest = raw.replace(/(\w+):(\S+)/g, (_, k: string, v: string) => {
    const canonical = FIELD_ALIASES[k.toLowerCase()] ?? k.toLowerCase()
    fields[canonical] = v.toLowerCase()
    return ''
  }).trim()
  const terms = rest.split(/\s+/).filter(Boolean).map((s) => s.toLowerCase())
  return { terms, fields }
}

function strVal(v: unknown): string {
  if (v == null) return ''
  return String(v).toLowerCase()
}

function numInRange(raw: unknown, rangeOrVal: string): boolean {
  const n = parseFloat(String(raw ?? ''))
  if (isNaN(n)) return false
  if (rangeOrVal.includes('-')) {
    const parts = rangeOrVal.split('-')
    const lo = parseFloat(parts[0])
    const hi = parseFloat(parts[1])
    return !isNaN(lo) && !isNaN(hi) && n >= lo && n <= hi
  }
  const exact = parseFloat(rangeOrVal)
  return !isNaN(exact) && Math.round(n) === Math.round(exact)
}

function validNum(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? ''))
  return isNaN(n) ? null : n
}

export function matchesTrack(
  t: Track,
  searchQuery: string,
  adv: AdvancedFilters,
): boolean {
  const { terms, fields } = parseQuery(searchQuery)

  // Free-text: every term must match at least one field (AND across terms, OR across fields)
  for (const term of terms) {
    const hit = TEXT_FIELDS.some((k) => strVal(t[k]).includes(term))
    if (!hit) return false
  }

  // Field-specific tokens from the search box
  if (fields.bpm && !numInRange(t.bpm, fields.bpm)) return false
  if (fields.energy && !numInRange(t.energy, fields.energy)) return false
  if (fields.key) {
    const kq = fields.key
    if (!strVal(t.key).includes(kq) && !strVal(t.camelot).includes(kq)) return false
  }
  if (fields.artist && !strVal(t.artist).includes(fields.artist)) return false
  if (fields.genre && !strVal(t.genre).includes(fields.genre)) return false
  if (fields.label && !strVal(t.label).includes(fields.label)) return false
  if (fields.format && !strVal(t.format).includes(fields.format)) return false
  if (fields.year && !strVal(t.year).includes(fields.year)) return false
  if (fields.album && !strVal(t.album).includes(fields.album)) return false
  if (fields.remixer && !strVal(t.remixer).includes(fields.remixer)) return false
  if (fields.comment && !strVal(t.comment).includes(fields.comment)) return false

  // Advanced panel filters — only apply when the value is a valid non-zero-length number string
  const bpmMinN = adv.bpmMin.trim() !== '' ? parseFloat(adv.bpmMin) : null
  const bpmMaxN = adv.bpmMax.trim() !== '' ? parseFloat(adv.bpmMax) : null
  if (bpmMinN !== null || bpmMaxN !== null) {
    const bpm = validNum(t.bpm)
    if (bpm === null) return false
    if (bpmMinN !== null && bpm < bpmMinN) return false
    if (bpmMaxN !== null && bpm > bpmMaxN) return false
  }

  const eMinN = adv.energyMin.trim() !== '' ? parseFloat(adv.energyMin) : null
  const eMaxN = adv.energyMax.trim() !== '' ? parseFloat(adv.energyMax) : null
  if (eMinN !== null || eMaxN !== null) {
    const e = validNum(t.energy)
    if (e === null) return false
    if (eMinN !== null && e < eMinN) return false
    if (eMaxN !== null && e > eMaxN) return false
  }

  if (adv.key.trim()) {
    const kq = adv.key.trim().toLowerCase()
    if (!strVal(t.key).includes(kq) && !strVal(t.camelot).includes(kq)) return false
  }
  if (adv.format.trim()) {
    if (!strVal(t.format).includes(adv.format.trim().toLowerCase())) return false
  }

  return true
}

export type ActiveTagFilter = { id: number; field: string; value: string }

export function matchesTagFilters(t: Track, tagFilters: ActiveTagFilter[]): boolean {
  if (!tagFilters.length) return true
  const byField = new Map<string, string[]>()
  for (const f of tagFilters) {
    if (!byField.has(f.field)) byField.set(f.field, [])
    byField.get(f.field)!.push(f.value.toLowerCase())
  }
  for (const [field, values] of byField) {
    const raw = strVal(t[field as keyof Track])
    const parts = raw.split('/').map((s) => s.trim())
    if (!values.some((v) => parts.includes(v))) return false
  }
  return true
}

export function countActiveFilters(adv: AdvancedFilters): number {
  let n = 0
  if (adv.bpmMin.trim() || adv.bpmMax.trim()) n++
  if (adv.energyMin.trim() || adv.energyMax.trim()) n++
  if (adv.key.trim()) n++
  if (adv.format.trim()) n++
  return n
}
