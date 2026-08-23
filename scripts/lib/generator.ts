import {
  simulateRoll,
  type GreenSurface,
  type PuzzleDefinition,
  type Vec2,
} from '../../src/sim/index'
import { between, hashString, integer, mulberry32, type Random } from './random'
import { validatePuzzle, type PuzzleMetrics } from './validate'

const PUZZLE_EPOCH = Date.UTC(2026, 0, 1)
const GENERATOR_SALT = 'puttle-variety-v3-real-roll'
const BLOCK_DAYS = 20
const EDGE_CLEARANCE = 2
const APPROACH_CLEARANCE = 1.25
const APPROACH_MIN_ANGLE = 40
const APPROACH_MAX_ANGLE = 140
const APPROACH_MIN_ROLLOUT = 6
const APPROACH_MAX_ROLLOUT = 12

export type DistanceProfile = 'short' | 'medium' | 'long' | 'showcase'
export type ContourProfile = 'conventional' | 'double'

export interface PuzzleSchedule {
  dayIndex: number
  blockIndex: number
  blockDay: number
  distanceProfile: DistanceProfile
  contourProfile: ContourProfile
  contourFamily: number
  compassSector: number
  neutralTwoPutt: boolean
}

const DISTANCE_BANDS: Record<DistanceProfile, readonly [number, number]> = {
  short: [16, 20],
  medium: [20, 26],
  long: [26, 32],
  showcase: [32, 36],
}

function dayIndex(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - PUZZLE_EPOCH) / 86_400_000)
}

function puzzleNumber(date: string): number {
  return dayIndex(date) + 1
}

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = integer(random, 0, index)
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function distanceSchedule(blockIndex: number): DistanceProfile[] {
  const random = mulberry32(hashString(`${GENERATOR_SALT}:distance:${blockIndex}`))
  const previousLast = blockIndex > 0 ? distanceSchedule(blockIndex - 1).at(-1) : undefined
  const remaining: Record<DistanceProfile, number> = {
    short: 5,
    medium: 9,
    long: 5,
    showcase: 1,
  }
  const result: DistanceProfile[] = []
  while (result.length < BLOCK_DAYS) {
    const choices = shuffled(
      (Object.keys(remaining) as DistanceProfile[]).filter(
        (profile) => remaining[profile] > 0 && profile !== (result.at(-1) ?? previousLast),
      ),
      random,
    ).sort((a, b) => remaining[b] - remaining[a])
    const selected = choices[0] ?? (Object.keys(remaining) as DistanceProfile[])
      .find((profile) => remaining[profile] > 0) as DistanceProfile
    result.push(selected)
    remaining[selected] -= 1
  }
  return result
}

function doubleBreakDays(blockIndex: number, distances: readonly DistanceProfile[]): Set<number> {
  const random = mulberry32(hashString(`${GENERATOR_SALT}:double:${blockIndex}`))
  const eligible = shuffled(
    distances.map((profile, index) => ({ profile, index })).filter(
      ({ profile, index }) => profile !== 'short' && index > 0 && index < BLOCK_DAYS - 1,
    ),
    random,
  )
  const selected = new Set<number>()
  for (const { index } of eligible) {
    if ([...selected].every((day) => Math.abs(day - index) > 1)) selected.add(index)
    if (selected.size === 3) break
  }
  if (selected.size !== 3) throw new Error(`Could not schedule double breaks for block ${blockIndex}`)
  return selected
}

function neutralTwoPuttDays(blockIndex: number, doubleDays: ReadonlySet<number>): Set<number> {
  const random = mulberry32(hashString(`${GENERATOR_SALT}:neutral-two:${blockIndex}`))
  // Designed double breaks challenge the first-putt read, but forcing their
  // short recovery putts to miss as well selected for unfair cup-area slopes.
  // Count all three in the block's limited neutral two-putt allowance, then
  // distribute three conventional recovery days around them.
  const selected = new Set(doubleDays)
  const eligible = shuffled(Array.from({ length: BLOCK_DAYS - 2 }, (_, index) => index + 1), random)
  for (const index of eligible) {
    if ([...selected].every((day) => Math.abs(day - index) > 1)) selected.add(index)
    if (selected.size === 6) break
  }
  if (selected.size !== 6) throw new Error(`Could not schedule neutral two-putts for block ${blockIndex}`)
  return selected
}

function sectorFor(day: number): number {
  // Every eight-day run visits all compass sectors. A step of three sectors
  // keeps neighboring dates 135 degrees apart, including cycle seams. This
  // affine permutation is the deterministic shuffle for each eight-day run.
  const start = hashString(`${GENERATOR_SALT}:bearing-origin`) % 8
  return ((start + 3 * day) % 8 + 8) % 8
}

export function scheduleForDate(date: string): PuzzleSchedule {
  const index = dayIndex(date)
  const blockIndex = Math.floor(index / BLOCK_DAYS)
  const blockDay = ((index % BLOCK_DAYS) + BLOCK_DAYS) % BLOCK_DAYS
  const distances = distanceSchedule(blockIndex)
  const doubles = doubleBreakDays(blockIndex, distances)
  const contourProfile: ContourProfile = doubles.has(blockDay) ? 'double' : 'conventional'
  const neutralTwos = neutralTwoPuttDays(blockIndex, doubles)
  return {
    dayIndex: index,
    blockIndex,
    blockDay,
    distanceProfile: distances[blockDay],
    contourProfile,
    contourFamily: contourProfile === 'double' ? 4 : ((index % 4) + 4) % 4,
    compassSector: sectorFor(index),
    neutralTwoPutt: neutralTwos.has(blockDay),
  }
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angleBetween(a: Vec2, b: Vec2): number {
  const aLength = Math.hypot(a.x, a.y)
  const bLength = Math.hypot(b.x, b.y)
  if (aLength === 0 || bLength === 0) return 0
  const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (aLength * bLength)))
  return (Math.acos(cosine) * 180) / Math.PI
}

function distanceToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distanceBetween(point, from)
  const ratio = Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
  ))
  return distanceBetween(point, { x: from.x + dx * ratio, y: from.y + dy * ratio })
}

function hasClearance(puzzle: PuzzleDefinition, point: Vec2, clearance: number): boolean {
  return point.x >= clearance && point.x <= puzzle.green.width - clearance &&
    point.y >= clearance && point.y <= puzzle.green.height - clearance
}

function addConventionalContours(
  green: GreenSurface,
  line: Vec2,
  perpendicular: Vec2,
  center: Vec2,
  family: number,
  neutralTwoPutt: boolean,
  random: Random,
): void {
  const slopeSign = random() < 0.5 ? -1 : 1
  const crossSlope = between(
    random,
    neutralTwoPutt ? 0.01 : 0.014,
    neutralTwoPutt ? 0.015 : 0.019,
  ) * slopeSign
  const alongSlope = between(random, -0.0035, 0.0035)
  green.tilt = {
    x: line.x * alongSlope + perpendicular.x * crossSlope,
    y: line.y * alongSlope + perpendicular.y * crossSlope,
  }
  const bumpCount = family === 0 ? 1 : family === 1 ? 2 : 3
  for (let index = 0; index < bumpCount; index += 1) {
    green.bumps.push({
      center: {
        x: center.x + between(random, -green.width * 0.27, green.width * 0.27),
        y: center.y + between(random, -green.height * 0.27, green.height * 0.27),
      },
      radius: between(random, 10, 18),
      height: between(random, -0.11, 0.11),
    })
  }
  if (family === 2) {
    const normalAngle = between(random, -0.7, 0.7)
    const normal = {
      x: perpendicular.x * Math.cos(normalAngle) + line.x * Math.sin(normalAngle),
      y: perpendicular.y * Math.cos(normalAngle) + line.y * Math.sin(normalAngle),
    }
    green.tier = {
      normal,
      offset: normal.x * center.x + normal.y * center.y + between(random, -5, 5),
      height: between(random, -0.09, 0.09),
      halfWidth: between(random, 4.5, 6.5),
    }
  }
}

function addDoubleBreakContours(
  green: GreenSurface,
  line: Vec2,
  perpendicular: Vec2,
  center: Vec2,
  distance: number,
  neutralTwoPutt: boolean,
  random: Random,
): void {
  const sign = random() < 0.5 ? -1 : 1
  const alongSlope = between(random, -0.0025, 0.0025)
  const longDouble = distance >= 26
  const crossSlope = between(
    random,
    neutralTwoPutt ? (longDouble ? 0.004 : 0.002) : 0.003,
    neutralTwoPutt ? (longDouble ? 0.008 : 0.006) : 0.007,
  ) * sign
  green.tilt = {
    x: line.x * alongSlope + perpendicular.x * crossSlope,
    y: line.y * alongSlope + perpendicular.y * crossSlope,
  }
  const broadRadius = Math.max(12, Math.min(17, distance * 0.5))
  for (const phase of [-1, 1] as const) {
    // Keep the later influence clear of the three-foot cup neighborhood while
    // allowing the two broad shoulders to act on successive parts of the roll.
    const along = (phase < 0 ? -0.25 : 0.1) * distance
    const side = phase * sign * broadRadius * between(random, 0.42, 0.5)
    green.bumps.push({
      center: {
        x: center.x + line.x * along + perpendicular.x * side,
        y: center.y + line.y * along + perpendicular.y * side,
      },
      radius: broadRadius + between(random, -0.75, 0.75),
      height: between(random, neutralTwoPutt ? 0.13 : 0.17, neutralTwoPutt ? 0.18 : 0.21),
    })
  }
}

function candidate(date: string, schedule: PuzzleSchedule, random: Random): PuzzleDefinition | undefined {
  const [minimumDistance, maximumDistance] = DISTANCE_BANDS[schedule.distanceProfile]
  const distance = between(random, minimumDistance + 0.08, maximumDistance - 0.08)
  const sectorCenter = schedule.compassSector * 45
  const bearing = sectorCenter + between(random, -12, 12)
  const bearingRadians = (bearing * Math.PI) / 180
  const line = { x: Math.cos(bearingRadians), y: Math.sin(bearingRadians) }
  const perpendicular = { x: -line.y, y: line.x }
  const width = Math.max(44, Math.abs(line.x) * distance + 36) + between(random, 0, 4)
  const height = Math.max(44, Math.abs(line.y) * distance + 36) + between(random, 0, 4)
  const center = { x: width / 2, y: height / 2 }
  const jitter = {
    x: between(random, -1.5, 1.5),
    y: between(random, -1.5, 1.5),
  }
  const nominalBall = {
    x: center.x - line.x * distance / 2 + jitter.x,
    y: center.y - line.y * distance / 2 + jitter.y,
  }
  const hole = {
    x: center.x + line.x * distance / 2 + jitter.x,
    y: center.y + line.y * distance / 2 + jitter.y,
  }
  const green: GreenSurface = {
    width,
    height,
    fringe: 3,
    tilt: { x: 0, y: 0 },
    bumps: [],
  }
  if (schedule.contourProfile === 'double') {
    addDoubleBreakContours(green, line, perpendicular, center, distance, schedule.neutralTwoPutt, random)
  } else {
    addConventionalContours(
      green,
      line,
      perpendicular,
      center,
      schedule.contourFamily,
      schedule.neutralTwoPutt,
      random,
    )
  }

  const puzzle: PuzzleDefinition = {
    version: 2,
    date,
    number: puzzleNumber(date),
    stimp: between(random, 9.5, schedule.distanceProfile === 'showcase' ? 11.2 : 12),
    green,
    approach: { from: nominalBall, velocity: { x: 0, y: 0 } },
    ball: nominalBall,
    hole,
  }
  if (!hasClearance(puzzle, nominalBall, EDGE_CLEARANCE) || !hasClearance(puzzle, hole, EDGE_CLEARANCE)) {
    return undefined
  }

  const angle = between(random, APPROACH_MIN_ANGLE, APPROACH_MAX_ANGLE) * (random() < 0.5 ? -1 : 1)
  const radians = (angle * Math.PI) / 180
  const heading = {
    x: line.x * Math.cos(radians) - line.y * Math.sin(radians),
    y: line.x * Math.sin(radians) + line.y * Math.cos(radians),
  }
  const targetRollout = between(random, APPROACH_MIN_ROLLOUT, APPROACH_MAX_ROLLOUT)
  const from = {
    x: nominalBall.x - heading.x * targetRollout,
    y: nominalBall.y - heading.y * targetRollout,
  }
  if (!hasClearance(puzzle, from, APPROACH_CLEARANCE)) return undefined

  let low = 0
  let high = 12
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const speed = (low + high) / 2
    const roll = simulateRoll(puzzle, from, { x: heading.x * speed, y: heading.y * speed })
    const rollout = distanceBetween(from, roll.final)
    if (rollout < targetRollout) low = speed
    else high = speed
  }
  const speed = (low + high) / 2
  const velocity = { x: heading.x * speed, y: heading.y * speed }
  const approach = simulateRoll(puzzle, from, velocity)
  puzzle.approach = { from, velocity }
  puzzle.ball = approach.final

  const puttDistance = distanceBetween(puzzle.ball, puzzle.hole)
  const entryAngle = angleBetween(heading, {
    x: puzzle.hole.x - puzzle.ball.x,
    y: puzzle.hole.y - puzzle.ball.y,
  })
  if (puttDistance < minimumDistance || puttDistance > maximumDistance) return undefined
  if (!hasClearance(puzzle, puzzle.ball, EDGE_CLEARANCE)) return undefined
  if (entryAngle < APPROACH_MIN_ANGLE || entryAngle > APPROACH_MAX_ANGLE) return undefined
  if (approach.path.some((point, index) => index > 0 && distanceToSegment(
    puzzle.hole,
    approach.path[index - 1],
    point,
  ) < 2)) return undefined
  if (approach.path.some((point) => !hasClearance(puzzle, point, APPROACH_CLEARANCE))) return undefined

  const repeated = simulateRoll(puzzle, from, velocity, { recordPath: false })
  if (repeated.final.x !== puzzle.ball.x || repeated.final.y !== puzzle.ball.y) {
    throw new Error('Approach roll must reproduce the stored ball position exactly')
  }
  return puzzle
}

export interface GeneratedPuzzle {
  puzzle: PuzzleDefinition
  metrics: PuzzleMetrics
  attempts: number
  schedule: PuzzleSchedule
}

export function generatePuzzle(
  date: string,
  options: {
    salt?: string
    maxAttempts?: number
    secondPuttSamples?: number
  } = {},
): GeneratedPuzzle {
  const schedule = scheduleForDate(date)
  const seed = hashString(`${date}:${options.salt ?? GENERATOR_SALT}`)
  const random = mulberry32(seed)
  const maxAttempts = options.maxAttempts ?? 3_000
  let best: { puzzle: PuzzleDefinition; metrics: PuzzleMetrics; rank: number } | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const puzzle = candidate(date, schedule, random)
    if (!puzzle) continue
    const metrics = validatePuzzle(puzzle, {
      secondPuttSamples: options.secondPuttSamples ?? 20,
      expectedContour: schedule.contourProfile,
      expectedNeutralTwoPutt: schedule.neutralTwoPutt,
    })
    if (metrics.passed) return { puzzle, metrics, attempts: attempt, schedule }
    const rank = metrics.failures.length * 100 + Math.abs(metrics.makeWindow - 0.012) * 100
    if (!best || rank < best.rank) best = { puzzle, metrics, rank }
  }

  const details = best
    ? ` Closest candidate failed: ${best.metrics.failures.join(', ')}.`
    : ''
  throw new Error(`Could not generate a valid puzzle for ${date} in ${maxAttempts} attempts.${details}`)
}
