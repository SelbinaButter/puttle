import { localDate, previousDate } from './date'
import type { PlayerStats, SavedRound } from './types'

const LEGACY_ROUND_KEY = 'break:round:v1'
const LEGACY_ROUND_KEY_PREFIX = 'break:round:v1:'
const LEGACY_STATS_KEY = 'break:stats:v1'
// Persistence is deliberately decoupled from the display brand. Renaming the
// game must not reset saved rounds, onboarding, or player streaks.
const ROUND_KEY_PREFIX = 'puttle:round:v1:'
const STATS_KEY = 'puttle:stats:v1'
const ONBOARDING_KEY = 'puttle:onboarding:v1'

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

export function loadRound(date: string): SavedRound {
  const saved =
    read<SavedRound>(`${ROUND_KEY_PREFIX}${date}`) ??
    read<SavedRound>(`${LEGACY_ROUND_KEY_PREFIX}${date}`) ??
    read<SavedRound>(LEGACY_ROUND_KEY)
  return saved?.date === date ? saved : { date, strokes: [] }
}

export function saveRound(round: SavedRound): void {
  localStorage.setItem(`${ROUND_KEY_PREFIX}${round.date}`, JSON.stringify(round))
}

export function loadStats(): PlayerStats {
  const stats = read<PlayerStats>(STATS_KEY) ?? read<PlayerStats>(LEGACY_STATS_KEY) ?? { ...EMPTY_STATS }
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
