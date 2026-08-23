import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  generatePuzzle,
  scheduleForDate,
  type DistanceProfile,
  type GeneratedPuzzle,
} from '../../scripts/lib/generator'
import { simulateRoll } from '../../src/sim'

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function sectorDifference(a: number, b: number): number {
  const difference = Math.abs(a - b)
  return Math.min(difference, 8 - difference)
}

describe('daily generator', () => {
  it('generates deterministic representative puzzles that pass every gate', () => {
    let previous: ReturnType<typeof scheduleForDate> | undefined
    for (let day = 0; day < 6; day += 1) {
      const date = addDays('2026-01-01', day)
      const generated = generatePuzzle(date)
      const archived = JSON.parse(readFileSync(resolve('public/puzzles', `${date}.json`), 'utf8'))
      expect(generated.puzzle).toEqual(archived)
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
      expect(generated.metrics.neutralSecondMakeRate).toBeLessThanOrEqual(0.75)
      expect(generated.metrics.neutralStrategy.strokes === 2)
        .toBe(generated.schedule.neutralTwoPutt)
      expect(generated.metrics.maxLocalGrade).toBeLessThanOrEqual(0.035)
      expect(generated.metrics.maxCupGrade).toBeLessThanOrEqual(0.02)
      expect(generated.metrics.edgeClearance).toBeGreaterThanOrEqual(1.25)
      expect(generated.metrics.doubleBreak.detected).toBe(generated.schedule.contourProfile === 'double')
      if (previous) {
        expect(generated.schedule.distanceProfile).not.toBe(previous.distanceProfile)
        expect(generated.schedule.contourFamily).not.toBe(previous.contourFamily)
        expect(sectorDifference(generated.schedule.compassSector, previous.compassSector))
          .toBeGreaterThanOrEqual(2)
      }
      previous = generated.schedule
    }
  }, 120_000)

  it('assigns every complete block an exact editorial mix', () => {
    for (let block = 0; block < 6; block += 1) {
      const schedules = Array.from({ length: 20 }, (_, day) =>
        scheduleForDate(addDays('2026-01-01', block * 20 + day)))
      const counts = schedules.reduce<Record<DistanceProfile, number>>((result, schedule) => {
        result[schedule.distanceProfile] += 1
        return result
      }, { short: 0, medium: 0, long: 0, showcase: 0 })
      expect(counts).toEqual({ short: 5, medium: 9, long: 5, showcase: 1 })
      const doubleDays = schedules.filter((schedule) => schedule.contourProfile === 'double')
      expect(doubleDays).toHaveLength(3)
      expect(doubleDays.every((schedule) => schedule.distanceProfile !== 'short')).toBe(true)
      expect(doubleDays.every((schedule, index) =>
        index === 0 || schedule.blockDay - doubleDays[index - 1].blockDay > 1)).toBe(true)
      const neutralTwoPuttDays = schedules.filter((schedule) => schedule.neutralTwoPutt)
      expect(neutralTwoPuttDays).toHaveLength(6)
      expect(doubleDays.every((schedule) => schedule.neutralTwoPutt)).toBe(true)
      expect(neutralTwoPuttDays.every((schedule, index) =>
        index === 0 || schedule.blockDay - neutralTwoPuttDays[index - 1].blockDay > 1)).toBe(true)
      expect(new Set(schedules.map((schedule) => schedule.compassSector))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]))
    }
  })

  it('stores reproducible, fully validated archived puzzles', () => {
    const puzzleDirectory = resolve('public/puzzles')
    const solutionDirectory = resolve('.generated/solutions')
    const files = readdirSync(puzzleDirectory).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const puzzle = JSON.parse(readFileSync(resolve(puzzleDirectory, file), 'utf8')) as GeneratedPuzzle['puzzle']
      const metrics = JSON.parse(readFileSync(resolve(solutionDirectory, file), 'utf8')) as GeneratedPuzzle['metrics']
      expect(puzzle.version).toBe(2)
      const roll = simulateRoll(puzzle, puzzle.approach.from, puzzle.approach.velocity, { recordPath: false })
      expect(roll.final.x, file).toBe(puzzle.ball.x)
      expect(roll.final.y, file).toBe(puzzle.ball.y)
      expect(metrics.passed, file).toBe(true)
      expect(metrics.maxLocalGrade, file).toBeLessThanOrEqual(0.035)
      expect(metrics.maxCupGrade, file).toBeLessThanOrEqual(0.02)
      expect(metrics.neutralSecondMakeRate, file).toBeLessThanOrEqual(0.75)
    }
  })
})
