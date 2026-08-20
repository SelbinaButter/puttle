import { describe, expect, it } from 'vitest'
import { generatePuzzle } from '../../scripts/lib/generator'

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

describe('daily generator', () => {
  it('generates 60 consecutive puzzles that pass every gate', () => {
    for (let day = 0; day < 60; day += 1) {
      const generated = generatePuzzle(addDays('2026-01-01', day))
      expect(generated.metrics.passed, generated.metrics.failures.join(', ')).toBe(true)
      expect(generated.metrics.secondPutts).toHaveLength(20)
      expect(generated.metrics.secondPuttPassRate).toBeGreaterThanOrEqual(0.9)
    }
  }, 600_000)
})
