import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generatePuzzle } from './lib/generator'
import { simulateRoll, type PuzzleDefinition } from '../src/sim'

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const days = Number(process.argv[2] ?? 60)
assert(Number.isInteger(days) && days >= 60, 'Replay audit must cover at least 60 days')

for (let day = 0; day < days; day += 1) {
  const date = addDays('2026-01-01', day)
  const generated = generatePuzzle(date)
  const archived = JSON.parse(
    await readFile(resolve('public/puzzles', `${date}.json`), 'utf8'),
  ) as PuzzleDefinition
  assert.deepEqual(generated.puzzle, archived, `${date}: deterministic replay differs from archive`)
  assert(generated.metrics.passed, `${date}: replay failed ${generated.metrics.failures.join(', ')}`)
  const approach = simulateRoll(
    generated.puzzle,
    generated.puzzle.approach.from,
    generated.puzzle.approach.velocity,
    { recordPath: false },
  )
  assert.equal(approach.final.x, generated.puzzle.ball.x, `${date}: approach x differs`)
  assert.equal(approach.final.y, generated.puzzle.ball.y, `${date}: approach y differs`)
  if ((day + 1) % 10 === 0) console.log(`Replayed ${day + 1}/${days} dates.`)
}

console.log(`Deterministic replay passed for ${days} consecutive dates.`)
