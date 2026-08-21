import {
  AIM_UNIT_VECTORS,
  simulateRoll,
  type GreenSurface,
  type PuzzleDefinition,
  type Vec2,
} from '../../src/sim/index'
import { between, hashString, integer, mulberry32, type Random } from './random'
import { validatePuzzle, type PuzzleMetrics } from './validate'

const PUZZLE_EPOCH = Date.UTC(2026, 0, 1)
const APPROACH_MIN_ANGLE = 40
const APPROACH_MAX_ANGLE = 140
const APPROACH_MIN_ROLLOUT = 6
const APPROACH_MAX_ROLLOUT = 12

function puzzleNumber(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - PUZZLE_EPOCH) / 86_400_000) + 1
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function angleBetween(a: Vec2, b: Vec2): number {
  const aLength = Math.sqrt(a.x * a.x + a.y * a.y)
  const bLength = Math.sqrt(b.x * b.x + b.y * b.y)
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

function onGreen(puzzle: PuzzleDefinition, point: Vec2): boolean {
  return point.x >= 0 && point.x <= puzzle.green.width && point.y >= 0 && point.y <= puzzle.green.height
}

function candidate(date: string, random: Random): PuzzleDefinition | undefined {
  const width = between(random, 34, 40)
  const height = between(random, 26, 32)
  const center = { x: width / 2, y: height / 2 }
  const line = AIM_UNIT_VECTORS[integer(random, 0, AIM_UNIT_VECTORS.length - 1)]
  const distance = between(random, 16, 23)
  const jitter: Vec2 = { x: between(random, -1.5, 1.5), y: between(random, -1.5, 1.5) }
  const nominalBall = {
    x: center.x - (line.x * distance) / 2 + jitter.x,
    y: center.y - (line.y * distance) / 2 + jitter.y,
  }
  const hole = {
    x: center.x + (line.x * distance) / 2 + jitter.x,
    y: center.y + (line.y * distance) / 2 + jitter.y,
  }
  const slopeSign = random() < 0.5 ? -1 : 1
  const crossSlope = between(random, 0.009, 0.022) * slopeSign
  const alongSlope = between(random, -0.004, 0.004)
  const tilt = {
    x: line.x * alongSlope - line.y * crossSlope,
    y: line.y * alongSlope + line.x * crossSlope,
  }
  const green: GreenSurface = {
    width,
    height,
    fringe: 3,
    tilt,
    bumps: [],
  }

  const bumpCount = integer(random, 1, 3)
  for (let index = 0; index < bumpCount; index += 1) {
    green.bumps.push({
      center: {
        x: between(random, width * 0.18, width * 0.82),
        y: between(random, height * 0.18, height * 0.82),
      },
      radius: between(random, 8, 15),
      height: between(random, -0.13, 0.13),
    })
  }

  // A tier is uncommon and intentionally gentle enough for the ball to rest.
  if (random() < 0.16) {
    const normal = AIM_UNIT_VECTORS[integer(random, 0, AIM_UNIT_VECTORS.length - 1)]
    green.tier = {
      normal,
      offset: normal.x * center.x + normal.y * center.y + between(random, -4, 4),
      height: between(random, -0.11, 0.11),
      halfWidth: between(random, 3.5, 5.5),
    }
  }

  const puzzle: PuzzleDefinition = {
    version: 2,
    date,
    number: puzzleNumber(date),
    stimp: between(random, 9.5, 12),
    green,
    approach: { from: nominalBall, velocity: { x: 0, y: 0 } },
    ball: nominalBall,
    hole,
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
  if (!onGreen(puzzle, from)) return undefined

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
  if (puttDistance < 16 || puttDistance > 23) return undefined
  if (entryAngle < APPROACH_MIN_ANGLE || entryAngle > APPROACH_MAX_ANGLE) return undefined
  if (approach.path.some((point, index) => index > 0 && distanceToSegment(
    puzzle.hole,
    approach.path[index - 1],
    point,
  ) < 2)) return undefined
  if (approach.path.some((point) => !onGreen(puzzle, point))) return undefined

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
}

export function generatePuzzle(
  date: string,
  options: { salt?: string; maxAttempts?: number; secondPuttSamples?: number } = {},
): GeneratedPuzzle {
  // Puzzle identity is deliberately decoupled from the display brand. Never
  // change this default salt during a rename.
  const seed = hashString(`${date}:${options.salt ?? 'puttle-v1'}`)
  const random = mulberry32(seed)
  const maxAttempts = options.maxAttempts ?? 500
  let best: { puzzle: PuzzleDefinition; metrics: PuzzleMetrics; rank: number } | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const puzzle = candidate(date, random)
    if (!puzzle) continue
    const metrics = validatePuzzle(puzzle, {
      secondPuttSamples: options.secondPuttSamples ?? 20,
    })
    if (metrics.passed) return { puzzle, metrics, attempts: attempt }

    const rank = metrics.failures.length * 100 + Math.abs(metrics.makeWindow - 0.012) * 100
    if (!best || rank < best.rank) best = { puzzle, metrics, rank }
  }

  const details = best
    ? ` Closest candidate failed: ${best.metrics.failures.join(', ')}.`
    : ''
  throw new Error(`Could not generate a valid puzzle for ${date} in ${maxAttempts} attempts.${details}`)
}
