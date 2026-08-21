import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generatePuzzle } from '../../scripts/lib/generator'
import { simulateRoll } from '../../src/sim'

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

describe('daily generator', () => {
  it('generates 60 consecutive puzzles that pass every gate', () => {
    for (let day = 0; day < 60; day += 1) {
      const generated = generatePuzzle(addDays('2026-01-01', day))
      const roll = simulateRoll(
        generated.puzzle,
        generated.puzzle.approach.from,
        generated.puzzle.approach.velocity,
        { recordPath: false },
      )
      expect(roll.final.x).toBe(generated.puzzle.ball.x)
      expect(roll.final.y).toBe(generated.puzzle.ball.y)
      expect(generated.metrics.passed, generated.metrics.failures.join(', ')).toBe(true)
      expect(generated.metrics.secondPutts).toHaveLength(20)
      expect(generated.metrics.secondPuttPassRate).toBeGreaterThanOrEqual(0.9)
    }
  }, 600_000)

  it('stores an exactly reproducible approach in every archived puzzle', () => {
    const directory = resolve('public/puzzles')
    const files = readdirSync(directory).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const puzzle = JSON.parse(readFileSync(resolve(directory, file), 'utf8')) as ReturnType<typeof generatePuzzle>['puzzle']
      expect(puzzle.version).toBe(2)
      const roll = simulateRoll(puzzle, puzzle.approach.from, puzzle.approach.velocity, { recordPath: false })
      expect(roll.final.x, file).toBe(puzzle.ball.x)
      expect(roll.final.y, file).toBe(puzzle.ball.y)
    }
  })
})
