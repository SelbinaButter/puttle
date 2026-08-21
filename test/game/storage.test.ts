import { describe, expect, it } from 'vitest'
import { puzzleFingerprint } from '../../src/game/storage'
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
})
