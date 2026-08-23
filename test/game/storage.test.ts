import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasSeenOnboarding,
  loadRound,
  loadStats,
  puzzleFingerprint,
} from '../../src/game/storage'
import { TEST_PUZZLE } from '../fixtures/puzzle'

describe('round puzzle identity', () => {
  it('is stable for the same public definition', () => {
    expect(puzzleFingerprint(structuredClone(TEST_PUZZLE))).toBe(puzzleFingerprint(TEST_PUZZLE))
  })

  it('changes when regenerated puzzle geometry changes', () => {
    const regenerated = {
      ...TEST_PUZZLE,
      hole: { ...TEST_PUZZLE.hole, x: TEST_PUZZLE.hole.x + 0.01 },
    }
    expect(puzzleFingerprint(regenerated)).not.toBe(puzzleFingerprint(TEST_PUZZLE))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts generation-two gameplay records clean while preserving onboarding', () => {
    const values = new Map<string, string>([
      [`puttle:round:v1:${TEST_PUZZLE.date}`, JSON.stringify({
        date: TEST_PUZZLE.date,
        puzzleFingerprint: puzzleFingerprint(TEST_PUZZLE),
        strokes: [{ holed: true }],
      })],
      ['puttle:stats:v1', JSON.stringify({
        currentStreak: 20,
        bestStreak: 20,
        history: [{ date: TEST_PUZZLE.date, puzzleNumber: 1, strokes: 1 }],
        distribution: { 1: 1 },
      })],
      ['puttle:onboarding:v1', 'seen'],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })

    expect(loadRound(TEST_PUZZLE).strokes).toEqual([])
    expect(loadStats().history).toEqual([])
    expect(hasSeenOnboarding()).toBe(true)
  })
})
