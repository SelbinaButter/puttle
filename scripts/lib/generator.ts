import {
  AIM_UNIT_VECTORS,
  type GreenSurface,
  type PuzzleDefinition,
  type Vec2,
} from '../../src/sim/index'
import { between, hashString, integer, mulberry32, type Random } from './random'
import { validatePuzzle, type PuzzleMetrics } from './validate'

const PUZZLE_EPOCH = Date.UTC(2026, 0, 1)

function puzzleNumber(date: string): number {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - PUZZLE_EPOCH) / 86_400_000) + 1
}

function candidate(date: string, random: Random): PuzzleDefinition {
  const width = between(random, 34, 40)
  const height = between(random, 26, 32)
  const center = { x: width / 2, y: height / 2 }
  const line = AIM_UNIT_VECTORS[integer(random, 0, AIM_UNIT_VECTORS.length - 1)]
  const distance = between(random, 16, 23)
  const jitter: Vec2 = { x: between(random, -1.5, 1.5), y: between(random, -1.5, 1.5) }
  const ball = {
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

  return {
    version: 1,
    date,
    number: puzzleNumber(date),
    stimp: between(random, 9.5, 12),
    green,
    ball,
    hole,
  }
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
  const seed = hashString(`${date}:${options.salt ?? 'puttle-v1'}`)
  const random = mulberry32(seed)
  const maxAttempts = options.maxAttempts ?? 500
  let best: { puzzle: PuzzleDefinition; metrics: PuzzleMetrics; rank: number } | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const puzzle = candidate(date, random)
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
