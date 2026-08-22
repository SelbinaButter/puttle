import type { PathPoint, Vec2 } from '../sim'

export interface PlayedStroke {
  aimIndex: number
  speedIndex: number
  start: Vec2
  final: Vec2
  finalDistance: number
  holed: boolean
  lipOut: boolean
  elapsed: number
  path: PathPoint[]
}

export interface SavedRound {
  date: string
  puzzleFingerprint: string
  strokes: PlayedStroke[]
}

export interface HistoryEntry {
  date: string
  puzzleNumber: number
  strokes: number | null
}

export interface PlayerStats {
  currentStreak: number
  bestStreak: number
  lastCompletedDate?: string
  history: HistoryEntry[]
  distribution: Record<string, number>
}
