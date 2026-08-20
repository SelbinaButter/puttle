import { describe, expect, it } from 'vitest'
import { heightAt, sampleSurface, type GreenSurface } from '../../src/sim'

describe('analytic surface', () => {
  it('matches a finite-difference gradient inside a compact bump', () => {
    const surface: GreenSurface = {
      width: 30,
      height: 30,
      fringe: 3,
      tilt: { x: 0.01, y: -0.004 },
      bumps: [{ center: { x: 14, y: 12 }, radius: 8, height: 0.3 }],
      tier: { normal: { x: 1, y: 0 }, offset: 22, height: 0.1, halfWidth: 3 },
    }
    const point = { x: 16, y: 13 }
    const epsilon = 1e-5
    const sample = sampleSurface(surface, point)
    const dx =
      (heightAt(surface, { x: point.x + epsilon, y: point.y }) -
        heightAt(surface, { x: point.x - epsilon, y: point.y })) /
      (2 * epsilon)
    const dy =
      (heightAt(surface, { x: point.x, y: point.y + epsilon }) -
        heightAt(surface, { x: point.x, y: point.y - epsilon })) /
      (2 * epsilon)
    expect(sample.gradient.x).toBeCloseTo(dx, 8)
    expect(sample.gradient.y).toBeCloseTo(dy, 8)
  })

  it('has exactly zero bump influence outside compact support', () => {
    const surface: GreenSurface = {
      width: 30,
      height: 30,
      fringe: 3,
      tilt: { x: 0.01, y: 0.02 },
      bumps: [{ center: { x: 5, y: 5 }, radius: 2, height: 100 }],
    }
    const sample = sampleSurface(surface, { x: 20, y: 20 })
    expect(sample.height).toBeCloseTo(0.6, 14)
    expect(sample.gradient).toEqual({ x: 0.01, y: 0.02 })
  })
})
