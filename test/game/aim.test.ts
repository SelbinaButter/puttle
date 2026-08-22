import { describe, expect, it } from 'vitest'
import { aimIndexFromDrag, aimIndexFromPoints, speedIndexFromDrag } from '../../src/game/aim'

describe('direct aim input', () => {
  const ball = { x: 0, y: 0 }
  const hole = { x: 100, y: 0 }

  it('maps a pointer direction to the nearest canonical half degree', () => {
    const radians = (3.2 * Math.PI) / 180
    expect(aimIndexFromPoints(ball, hole, {
      x: Math.cos(radians) * 100,
      y: Math.sin(radians) * 100,
    })).toBe(36)
  })

  it('clamps direct input to the available aim range', () => {
    expect(aimIndexFromPoints(ball, hole, { x: 20, y: 100 })).toBe(60)
    expect(aimIndexFromPoints(ball, hole, { x: 20, y: -100 })).toBe(0)
  })

  it('does not change aim before a drag leaves the ball', () => {
    expect(aimIndexFromPoints(ball, hole, { x: 4, y: 2 })).toBeUndefined()
  })

  it('turns near-ball movement into fine relative adjustments', () => {
    expect(aimIndexFromDrag(30, 2, 4)).toBe(31)
    expect(aimIndexFromDrag(30, 20, 4)).toBe(40)
    expect(aimIndexFromDrag(30, -20, 4)).toBe(20)
  })

  it('clamps relative dragging to the canonical range', () => {
    expect(aimIndexFromDrag(30, 1_000, 4)).toBe(60)
    expect(aimIndexFromDrag(30, -1_000, 4)).toBe(0)
  })

  it('turns forward and back movement into canonical pace steps', () => {
    expect(speedIndexFromDrag(10, 7, 8)).toBe(11)
    expect(speedIndexFromDrag(10, -12, 8)).toBe(9)
    expect(speedIndexFromDrag(10, 1_000, 8)).toBe(30)
    expect(speedIndexFromDrag(10, -1_000, 8)).toBe(0)
  })
})
