import { describe, expect, it } from 'vitest'
import {
  FIXED_DT,
  GRAVITY_FTPS2,
  rollingAcceleration,
  simulatePutt,
  type PuzzleDefinition,
} from '../../src/sim'
import { TEST_PUZZLE } from '../fixtures/puzzle'

describe('putting simulation', () => {
  it('calibrates feet-past speed on a flat green', () => {
    const result = simulatePutt(TEST_PUZZLE, TEST_PUZZLE.ball, 30, 3, {
      captureHole: false,
    })
    expect(result.rested).toBe(true)
    expect(result.final.x).toBeCloseTo(TEST_PUZZLE.hole.x + 2, 1)
    expect(result.final.y).toBe(TEST_PUZZLE.ball.y)
  })

  it('loses speed monotonically on flat ground', () => {
    const result = simulatePutt(TEST_PUZZLE, TEST_PUZZLE.ball, 30, 10, {
      captureHole: false,
    })
    for (let index = 1; index < result.path.length; index += 1) {
      expect(result.path[index].speed).toBeLessThanOrEqual(result.path[index - 1].speed + 1e-12)
    }
  })

  it('accelerates downhill and never freezes on a slope above static friction', () => {
    const steep: PuzzleDefinition = {
      ...TEST_PUZZLE,
      green: { ...TEST_PUZZLE.green, tilt: { x: 0.06, y: 0 } },
    }
    const result = simulatePutt(steep, steep.ball, 30, 0, {
      captureHole: false,
      maxSeconds: 12,
    })
    expect(result.rested).toBe(false)
    expect(result.final.x).toBeLessThan(steep.ball.x)

    const slopeForce = GRAVITY_FTPS2 * 0.06
    expect(slopeForce).toBeGreaterThan(rollingAcceleration(steep.stimp))
    expect(FIXED_DT).toBe(1 / 240)
  })

  it('is bit-identical over 1,000 repeated canonical inputs', () => {
    const expected = simulatePutt(TEST_PUZZLE, TEST_PUZZLE.ball, 22, 8, {
      recordPath: false,
    })
    const serialized = JSON.stringify(expected)
    for (let repetition = 0; repetition < 1_000; repetition += 1) {
      expect(
        JSON.stringify(
          simulatePutt(TEST_PUZZLE, TEST_PUZZLE.ball, 22, 8, { recordPath: false }),
        ),
      ).toBe(serialized)
    }
  })
})
