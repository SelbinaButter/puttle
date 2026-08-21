import { describe, expect, it } from 'vitest'
import { TAP_IN_DISTANCE_FT, canTapIn, createTapInResult } from '../../src/game/tapIn'

const hole = { x: 10, y: 8 }

describe('tap in', () => {
  it('is available through exactly one foot', () => {
    expect(canTapIn({ x: 9.5, y: 8 }, hole)).toBe(true)
    expect(canTapIn({ x: 10 - TAP_IN_DISTANCE_FT, y: 8 }, hole)).toBe(true)
    expect(canTapIn({ x: 10 - TAP_IN_DISTANCE_FT - 0.001, y: 8 }, hole)).toBe(false)
  })

  it('creates a short holed stroke ending in the cup', () => {
    const ball = { x: 9.25, y: 8 }
    const result = createTapInResult(ball, hole)

    expect(result).toMatchObject({
      holed: true,
      lipOut: false,
      final: hole,
      finalDistance: 0,
    })
    expect(result?.path[0]).toMatchObject(ball)
    expect(result?.path.at(-1)).toMatchObject(hole)
    expect(result?.elapsed).toBeGreaterThan(0)
  })

  it('refuses to create a tap-in result from outside the limit', () => {
    expect(createTapInResult({ x: 8.999, y: 8 }, hole)).toBeUndefined()
  })
})
