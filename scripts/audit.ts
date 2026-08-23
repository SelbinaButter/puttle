import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scheduleForDate, type DistanceProfile, type PuzzleSchedule } from './lib/generator'
import { simulateRoll, type PuzzleDefinition } from '../src/sim'
import type { PuzzleMetrics } from './lib/validate'

interface StoredSolution extends PuzzleMetrics, PuzzleSchedule {
  date: string
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function sectorDifference(a: number, b: number): number {
  const difference = Math.abs(a - b)
  return Math.min(difference, 8 - difference)
}

const puzzleDirectory = resolve('public/puzzles')
const solutionDirectory = resolve('.generated/solutions')
const index = JSON.parse(await readFile(resolve(puzzleDirectory, 'index.json'), 'utf8')) as { dates: string[] }
const files = (await readdir(puzzleDirectory))
  .map((file) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1])
  .filter((date): date is string => Boolean(date))
  .sort()
invariant(JSON.stringify(index.dates) === JSON.stringify(files), 'Puzzle index does not match archive files')
invariant(files[0] === '2026-01-01', 'Archive must begin on 2026-01-01')
for (let index = 1; index < files.length; index += 1) {
  invariant(files[index] === addDays(files[index - 1], 1), `Archive gap before ${files[index]}`)
}

const solutions: StoredSolution[] = []
const sectorCounts = Array.from({ length: 8 }, () => 0)
for (const date of files) {
  const puzzle = JSON.parse(await readFile(resolve(puzzleDirectory, `${date}.json`), 'utf8')) as PuzzleDefinition
  const solution = JSON.parse(await readFile(resolve(solutionDirectory, `${date}.json`), 'utf8')) as StoredSolution
  const schedule = scheduleForDate(date)
  invariant(puzzle.version === 2, `${date}: wrong puzzle version`)
  invariant(solution.passed, `${date}: stored validation failed`)
  invariant(solution.distanceProfile === schedule.distanceProfile, `${date}: distance schedule mismatch`)
  invariant(solution.contourProfile === schedule.contourProfile, `${date}: contour schedule mismatch`)
  invariant(solution.contourFamily === schedule.contourFamily, `${date}: contour family mismatch`)
  invariant(solution.compassSector === schedule.compassSector, `${date}: compass schedule mismatch`)
  invariant(solution.neutralTwoPutt === schedule.neutralTwoPutt, `${date}: neutral strategy schedule mismatch`)
  invariant((solution.neutralStrategy.strokes === 2) === schedule.neutralTwoPutt,
    `${date}: neutral strategy outcome mismatch`)
  invariant(solution.neutralSecondMakeRate <= 0.75, `${date}: neutral recovery strategy is too dominant`)
  invariant(solution.doubleBreak.detected === (solution.contourProfile === 'double'), `${date}: double-break mismatch`)
  invariant(solution.maxLocalGrade <= 0.035, `${date}: local grade exceeds 3.5%`)
  invariant(solution.maxCupGrade <= 0.02, `${date}: cup grade exceeds 2%`)
  invariant(solution.edgeClearance >= 1.25, `${date}: edge clearance failed`)
  const bands: Record<DistanceProfile, readonly [number, number]> = {
    short: [16, 20], medium: [20, 26], long: [26, 32], showcase: [32, 36],
  }
  const [minimum, maximum] = bands[solution.distanceProfile]
  invariant(solution.distance >= minimum && solution.distance <= maximum, `${date}: distance outside assigned band`)
  const actualSector = Math.round(solution.bearing / 45) % 8
  invariant(actualSector === solution.compassSector, `${date}: bearing outside compass sector`)
  const approach = simulateRoll(puzzle, puzzle.approach.from, puzzle.approach.velocity, { recordPath: false })
  invariant(approach.final.x === puzzle.ball.x && approach.final.y === puzzle.ball.y, `${date}: approach is not exact`)
  sectorCounts[solution.compassSector] += 1
  solutions.push(solution)
}

for (let index = 1; index < solutions.length; index += 1) {
  const previous = solutions[index - 1]
  const current = solutions[index]
  invariant(current.distanceProfile !== previous.distanceProfile, `${current.date}: repeated distance profile`)
  invariant(current.contourFamily !== previous.contourFamily, `${current.date}: repeated contour family`)
  invariant(sectorDifference(current.compassSector, previous.compassSector) >= 2, `${current.date}: repeated bearing sector`)
}
for (let start = 0; start + 20 <= solutions.length; start += 20) {
  const block = solutions.slice(start, start + 20)
  const distances = block.reduce<Record<DistanceProfile, number>>((counts, solution) => {
    counts[solution.distanceProfile] += 1
    return counts
  }, { short: 0, medium: 0, long: 0, showcase: 0 })
  invariant(JSON.stringify(distances) === JSON.stringify({ short: 5, medium: 9, long: 5, showcase: 1 }),
    `${block[0].date}: wrong distance mix`)
  const doubles = block.filter((solution) => solution.contourProfile === 'double')
  invariant(doubles.length === 3, `${block[0].date}: wrong double-break count`)
  invariant(doubles.every((solution) => solution.distanceProfile !== 'short'), `${block[0].date}: short double break`)
  invariant(doubles.every((solution, index) => index === 0 || solution.blockDay - doubles[index - 1].blockDay > 1),
    `${block[0].date}: consecutive double breaks`)
  const neutralTwos = block.filter((solution) => solution.neutralTwoPutt)
  invariant(neutralTwos.length === 6, `${block[0].date}: wrong neutral two-putt count`)
  invariant(doubles.every((solution) => solution.neutralTwoPutt),
    `${block[0].date}: double break outside neutral two-putt allowance`)
  invariant(neutralTwos.every((solution, index) =>
    index === 0 || solution.blockDay - neutralTwos[index - 1].blockDay > 1),
  `${block[0].date}: consecutive neutral two-putts`)
}
invariant(Math.max(...sectorCounts) - Math.min(...sectorCounts) <= 1, 'Compass sectors are not balanced')

const neutralTwoPuttCount = solutions.filter((solution) => solution.neutralStrategy.strokes === 2).length
const neutralThreePuttCount = solutions.filter((solution) => solution.neutralStrategy.strokes === 3).length
invariant(neutralTwoPuttCount + neutralThreePuttCount === solutions.length,
  'Neutral strategy produced an unexpected stroke count')

console.log(`Audited ${solutions.length} puzzles from ${files[0]} through ${files.at(-1)}.`)
console.log(`Compass sectors: ${sectorCounts.join(', ')}; all generation, grade, edge, and approach gates passed.`)
console.log(`Neutral/default strategy: exactly 6 two-putts per complete 20-day block; sampled recovery success capped at 75%.`)
console.log(`Current archive outcome: ${neutralTwoPuttCount} two-putts (${(neutralTwoPuttCount / solutions.length * 100).toFixed(1)}%), ` +
  `${neutralThreePuttCount} three-putts; no one-putts or tap-ins.`)
