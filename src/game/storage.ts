import { localDate, previousDate } from './date'
import type { PuzzleDefinition } from '../sim'
import type { PlayerStats, SavedRound } from './types'

// Generation two intentionally starts gameplay records clean after the
// pre-launch archive rebuild. The onboarding key stays stable below.
const ROUND_KEY_PREFIX = 'puttle:round:v2:'
const STATS_KEY = 'puttle:stats:v2'
const ONBOARDING_KEY = 'puttle:onboarding:v1'
const ROUND_SIMULATION_VERSION = 4

const EMPTY_STATS: PlayerStats = {
  currentStreak: 0,
  bestStreak: 0,
  history: [],
  distribution: {},
}

function read<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : undefined
  } catch {
    return undefined
  }
}

export function puzzleFingerprint(puzzle: PuzzleDefinition): string {
  // The public definition has deterministic property order. Including the
  // simulation version also invalidates in-progress rounds when cup physics
  // changes without requiring every archived definition to be regenerated.
  return `${ROUND_SIMULATION_VERSION}:${JSON.stringify(puzzle)}`
}

export function loadRound(puzzle: PuzzleDefinition): SavedRound {
  const fingerprint = puzzleFingerprint(puzzle)
  const saved = read<SavedRound>(`${ROUND_KEY_PREFIX}${puzzle.date}`)
  return saved?.date === puzzle.date && saved.puzzleFingerprint === fingerprint
    ? saved
    : { date: puzzle.date, puzzleFingerprint: fingerprint, strokes: [] }
}

export function saveRound(puzzle: PuzzleDefinition, strokes: SavedRound['strokes']): void {
  const round: SavedRound = {
    date: puzzle.date,
    puzzleFingerprint: puzzleFingerprint(puzzle),
    strokes,
  }
  localStorage.setItem(`${ROUND_KEY_PREFIX}${round.date}`, JSON.stringify(round))
}

export function loadStats(): PlayerStats {
  const stats = read<PlayerStats>(STATS_KEY) ?? { ...EMPTY_STATS }
  const today = localDate()
  if (
    stats.lastCompletedDate &&
    stats.lastCompletedDate !== today &&
    stats.lastCompletedDate !== previousDate(today)
  ) {
    return { ...stats, currentStreak: 0 }
  }
  return stats
}

export function recordResult(
  date: string,
  puzzleNumber: number,
  strokes: number | null,
): PlayerStats {
  const stats = loadStats()
  if (stats.history.some((entry) => entry.date === date)) return stats
  const currentStreak = strokes === null
    ? 0
    : stats.lastCompletedDate === previousDate(date) ? stats.currentStreak + 1 : 1
  const distributionKey = strokes === null ? 'X' : String(strokes)
  const updated: PlayerStats = {
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    lastCompletedDate: date,
    history: [...stats.history, { date, puzzleNumber, strokes }].slice(-365),
    distribution: {
      ...stats.distribution,
      [distributionKey]: (stats.distribution[distributionKey] ?? 0) + 1,
    },
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(updated))
  return updated
}

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'seen'
}

export function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_KEY, 'seen')
}
