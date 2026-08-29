import { describe, expect, it } from 'vitest'
import { labelLayout } from '../../src/game/canvasLayout'

describe('green canvas annotations', () => {
  it('keeps a solution label inside a high-density mobile canvas', () => {
    const layout = labelLayout(
      640,
      530,
      { x: 590, y: 510 },
      430,
      2,
    )

    expect(layout.left).toBeGreaterThanOrEqual(16)
    expect(layout.left + layout.width).toBeLessThanOrEqual(624)
    expect(layout.top).toBeGreaterThanOrEqual(16)
    expect(layout.top + layout.height).toBeLessThanOrEqual(514)
    expect(layout.textX).toBeGreaterThan(layout.left)
    expect(layout.textY).toBeLessThan(layout.top + layout.height)
  })

  it('caps an unusually long solution label to the available canvas width', () => {
    const layout = labelLayout(
      320,
      265,
      { x: 300, y: 20 },
      500,
      1,
    )

    expect(layout.left).toBe(8)
    expect(layout.width).toBe(304)
    expect(layout.left + layout.width).toBe(312)
  })
})
