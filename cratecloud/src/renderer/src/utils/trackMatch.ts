import type { Track } from '../types/track'

export type CamelotKey = { num: number; letter: 'A' | 'B' }

export function parseCamelot(raw: string | undefined): CamelotKey | null {
  if (!raw) return null
  const m = /^\s*(\d{1,2})\s*([AaBb])\s*$/.exec(raw)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: m[2].toUpperCase() as 'A' | 'B' }
}

export function parseBpm(raw: string | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseEnergy(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

// Circular distance around the 12-position wheel (1 and 12 are adjacent)
function wheelDistance(numA: number, numB: number): number {
  const diff = Math.abs(numA - numB)
  return Math.min(diff, 12 - diff)
}

export function camelotScore(a: CamelotKey, b: CamelotKey): number {
  const dist = wheelDistance(a.num, b.num)
  const sameLetter = a.letter === b.letter

  if (dist === 0 && sameLetter) return 100   // identical key
  if (dist === 0) return 90                  // relative major/minor
  if (dist === 1 && sameLetter) return 85    // adjacent, standard safe mix
  if (dist === 1) return 60                  // adjacent, diagonal
  if (dist === 2 && sameLetter) return 50    // two-step energy shift
  return Math.max(0, 35 - 8 * dist)
}

function pctDiff(reference: number, other: number): number {
  return Math.abs(reference - other) / reference
}

// Percentage-based so the same absolute BPM gap scores differently at 90 vs
// 174 BPM, matching how pitch faders actually work. Checks half/double-time
// explicitly before falling back to direct proximity, since DJs treat those
// as equally mixable to a close match, not a coincidence to ignore.
export function bpmScore(bpmA: number, bpmB: number): number {
  const pct = Math.min(
    pctDiff(bpmA, bpmB),
    pctDiff(bpmA, bpmB * 2),
    pctDiff(bpmA, bpmB / 2)
  )
  if (pct <= 0.02) return 100
  if (pct >= 0.12) return 0
  return Math.round(100 - ((pct - 0.02) / 0.10) * 100)
}

// Quadratic falloff: small energy jumps (good for building a set) are barely
// penalized, big jumps drop off hard.
export function energyScore(energyA: number, energyB: number): number {
  const delta = Math.abs(energyA - energyB)
  return Math.max(0, Math.round(100 - 8 * delta * delta))
}

export type MatchWeights = { camelot: number; bpm: number; energy: number }

// Matches the algorithm's long-standing 45/35/20 balance — changing this
// changes results for everyone who's never touched the sliders, so it stays
// pinned to what combineScores always used, not the newer 50/30/20 split
// floated for the from-scratch spec.
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = { camelot: 45, bpm: 35, energy: 20 }

const MATCH_WEIGHTS_STORAGE_KEY = 'cratecloud_match_weights'

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

export function loadMatchWeights(): MatchWeights {
  try {
    const raw = localStorage.getItem(MATCH_WEIGHTS_STORAGE_KEY)
    if (!raw) return DEFAULT_MATCH_WEIGHTS
    const parsed = JSON.parse(raw) as Partial<MatchWeights>
    if (
      isFiniteNonNegative(parsed.camelot) &&
      isFiniteNonNegative(parsed.bpm) &&
      isFiniteNonNegative(parsed.energy) &&
      parsed.camelot + parsed.bpm + parsed.energy > 0
    ) {
      return { camelot: parsed.camelot, bpm: parsed.bpm, energy: parsed.energy }
    }
    return DEFAULT_MATCH_WEIGHTS
  } catch {
    return DEFAULT_MATCH_WEIGHTS
  }
}

export function saveMatchWeights(weights: MatchWeights): void {
  try {
    localStorage.setItem(MATCH_WEIGHTS_STORAGE_KEY, JSON.stringify(weights))
  } catch {
    // best-effort — a private-browsing/quota failure just means weights
    // don't persist this session, not worth surfacing to the DJ
  }
}

// Weights don't need to sum to 100 — normalized here so a slider tweak (e.g.
// key=80, bpm=60, energy=20) behaves the same as the equivalent proportion.
export function combineScores(
  camelot: number,
  bpm: number,
  energy: number,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS
): number {
  const total = weights.camelot + weights.bpm + weights.energy
  if (total <= 0) return Math.round(camelot * 0.45 + bpm * 0.35 + energy * 0.2)
  return Math.round(
    (camelot * weights.camelot + bpm * weights.bpm + energy * weights.energy) / total
  )
}

export type MatchResult = {
  track: Track
  score: number
  camelot: number
  bpm: number
  energy: number
}

// A track needs all three fields resolved to participate in matching at all —
// per the confirmed decision, partial data means exclusion, not a misleading
// partial score.
export function hasMatchableData(track: Track): boolean {
  return (
    parseCamelot(track.camelot) !== null &&
    parseBpm(track.bpm) !== null &&
    parseEnergy(track.energy) !== null
  )
}

export function scoreTrackPair(
  source: Track,
  candidate: Track,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS
): MatchResult | null {
  const srcCamelot = parseCamelot(source.camelot)
  const srcBpm = parseBpm(source.bpm)
  const srcEnergy = parseEnergy(source.energy)
  if (!srcCamelot || srcBpm === null || srcEnergy === null) return null

  const candCamelot = parseCamelot(candidate.camelot)
  const candBpm = parseBpm(candidate.bpm)
  const candEnergy = parseEnergy(candidate.energy)
  if (!candCamelot || candBpm === null || candEnergy === null) return null

  const camelot = camelotScore(srcCamelot, candCamelot)
  const bpm = bpmScore(srcBpm, candBpm)
  const energy = energyScore(srcEnergy, candEnergy)

  return { track: candidate, score: combineScores(camelot, bpm, energy, weights), camelot, bpm, energy }
}

export function findMatches(
  source: Track,
  candidates: Track[],
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS
): { matches: MatchResult[]; excludedCount: number } {
  let excludedCount = 0
  const matches: MatchResult[] = []

  for (const candidate of candidates) {
    if (candidate.id === source.id) continue
    const result = scoreTrackPair(source, candidate, weights)
    if (result) matches.push(result)
    else excludedCount++
  }

  matches.sort((a, b) => b.score - a.score)
  return { matches, excludedCount }
}
