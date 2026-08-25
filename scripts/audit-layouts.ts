import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scheduleForDate, type DistanceProfile } from './lib/generator'
import { simulateRoll, type PuzzleDefinition } from '../src/sim'

const DISTANCE_BANDS: Record<DistanceProfile, readonly [number, number]> = {
  short: [16, 20],
  medium: [20, 26],
  long: [26, 32],
  showcase: [32, 36],
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const puzzleDirectory = resolve('public/puzzles')
const archiveIndex = JSON.parse(
  await readFile(resolve(puzzleDirectory, 'index.json'), 'utf8'),
) as { dates: string[] }
const dates = (await readdir(puzzleDirectory))
  .map((file) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1])
  .filter((date): date is string => Boolean(date))
  .sort()

invariant(dates.length > 0, 'Puzzle archive is empty')
invariant(JSON.stringify(archiveIndex.dates) === JSON.stringify(dates),
  'Puzzle index does not match archive files')
for (let index = 1; index < dates.length; index += 1) {
  invariant(dates[index] === addDays(dates[index - 1], 1), `Archive gap before ${dates[index]}`)
}

const sectorCounts = Array.from({ length: 8 }, () => 0)
let ballLeft = 0
let ballRight = 0
let vertical = 0
let doubleBreaks = 0

for (const date of dates) {
  const puzzle = JSON.parse(
    await readFile(resolve(puzzleDirectory, `${date}.json`), 'utf8'),
  ) as PuzzleDefinition
  const schedule = scheduleForDate(date)
  const dx = puzzle.hole.x - puzzle.ball.x
  const dy = puzzle.hole.y - puzzle.ball.y
  const distance = Math.hypot(dx, dy)
  const bearing = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
  const sector = Math.round(bearing / 45) % 8
  const [minimumDistance, maximumDistance] = DISTANCE_BANDS[schedule.distanceProfile]

  invariant(puzzle.version === 2, `${date}: wrong puzzle version`)
  invariant(distance >= minimumDistance && distance <= maximumDistance,
    `${date}: ${distance.toFixed(2)}ft putt does not match ${schedule.distanceProfile} schedule`)
  invariant(sector === schedule.compassSector,
    `${date}: bearing sector ${sector} does not match scheduled sector ${schedule.compassSector}`)

  const expectedBumps = schedule.contourProfile === 'double'
    ? 2
    : schedule.contourFamily === 0
      ? 1
      : schedule.contourFamily === 1
        ? 2
        : 3
  invariant(puzzle.green.bumps.length === expectedBumps,
    `${date}: contour structure does not match its schedule`)
  invariant(Boolean(puzzle.green.tier) ===
    (schedule.contourProfile === 'conventional' && schedule.contourFamily === 2),
  `${date}: tier structure does not match its schedule`)

  const approach = simulateRoll(
    puzzle,
    puzzle.approach.from,
    puzzle.approach.velocity,
    { recordPath: false },
  )
  invariant(approach.final.x === puzzle.ball.x && approach.final.y === puzzle.ball.y,
    `${date}: approach does not reproduce the stored ball position`)

  sectorCounts[sector] += 1
  if (dx > 0) ballLeft += 1
  if (dx < 0) ballRight += 1
  if (Math.abs(dy) > Math.abs(dx)) vertical += 1
  if (schedule.contourProfile === 'double') doubleBreaks += 1
}

invariant(sectorCounts.every((count) => count > 0), 'Archive does not cover every compass sector')
invariant(ballLeft > 0 && ballRight > 0, 'Archive is locked to one horizontal direction')
invariant(vertical > 0, 'Archive contains no vertically oriented putts')

console.log(`Audited ${dates.length} deployable layouts from ${dates[0]} through ${dates.at(-1)}.`)
console.log(`Compass sectors: ${sectorCounts.join(', ')}; ball left/right: ${ballLeft}/${ballRight}; ` +
  `vertical: ${vertical}; scheduled double breaks: ${doubleBreaks}.`)
