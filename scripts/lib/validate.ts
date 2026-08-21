import {
  AIM_COUNT,
  SPEED_COUNT,
  aimDegrees,
  connectedComponents,
  rollingAcceleration,
  sampleSurface,
  simulatePutt,
  simulateRoll,
  widestMarginMake,
  type MakeInput,
  type PuzzleDefinition,
  type PuttResult,
  type Vec2,
} from '../../src/sim/index'

export interface SecondPuttMetric {
  start: Vec2
  distance: number
  makeCount: number
  makeWindow: number
  canRest: boolean
}

export interface PuzzleMetrics {
  totalInputs: number
  makeCount: number
  makeWindow: number
  widestAimDegrees: number
  approachLateralDeflection: number
  approachEntryAngle: number
  readAlignment: number
  coherentMakeSet: boolean
  componentCount: number
  forgiveness: number
  restingRate: number
  secondPutts: SecondPuttMetric[]
  secondPuttPassRate: number
  passed: boolean
  failures: string[]
  makes: MakeInput[]
}

interface FirstPuttSample {
  aimIndex: number
  speedIndex: number
  result: PuttResult
}

function enumerateFrom(puzzle: PuzzleDefinition, start: Vec2): FirstPuttSample[] {
  const samples: FirstPuttSample[] = []
  for (let aimIndex = 0; aimIndex < AIM_COUNT; aimIndex += 1) {
    for (let speedIndex = 0; speedIndex < SPEED_COUNT; speedIndex += 1) {
      samples.push({
        aimIndex,
        speedIndex,
        result: simulatePutt(puzzle, start, aimIndex, speedIndex, { recordPath: false }),
      })
    }
  }
  return samples
}

function evenlySample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items
  const sampled: T[] = []
  for (let index = 0; index < count; index += 1) {
    sampled.push(items[Math.floor((index * (items.length - 1)) / (count - 1))])
  }
  return sampled
}

function validateSecondPutts(
  puzzle: PuzzleDefinition,
  firstPutts: FirstPuttSample[],
  sampleCount: number,
): SecondPuttMetric[] {
  const useful = firstPutts
    .filter(
      ({ result }) =>
        !result.holed &&
        result.rested &&
        result.finalDistance >= 0.75 &&
        result.finalDistance <= 10,
    )
    .sort((a, b) => a.result.finalDistance - b.result.finalDistance)
  return evenlySample(useful, sampleCount).map(({ result }) => {
    const second = enumerateFrom(puzzle, result.final)
    const makeCount = second.filter((sample) => sample.result.holed).length
    const localGradient = sampleSurface(puzzle.green, result.final).gradient
    const slopeForce = 32.174 * Math.sqrt(
      localGradient.x * localGradient.x + localGradient.y * localGradient.y,
    )
    const canRest = slopeForce <= rollingAcceleration(puzzle.stimp) * 1.08
    return {
      start: result.final,
      distance: result.finalDistance,
      makeCount,
      makeWindow: makeCount / (AIM_COUNT * SPEED_COUNT),
      canRest,
    }
  })
}

export function validatePuzzle(
  puzzle: PuzzleDefinition,
  options: { secondPuttSamples?: number } = {},
): PuzzleMetrics {
  const firstPutts = enumerateFrom(puzzle, puzzle.ball)
  const makes = firstPutts
    .filter(({ result }) => result.holed)
    .map(({ aimIndex, speedIndex }) => ({ aimIndex, speedIndex }))
  const components = connectedComponents(makes)
  const widest = widestMarginMake(makes)
  const misses = firstPutts.filter(({ result }) => !result.holed)
  const forgiveness =
    misses.filter(({ result }) => result.rested && result.finalDistance <= 3).length /
    Math.max(1, misses.length)
  const restingRate =
    firstPutts.filter(({ result }) => result.holed || result.rested).length / firstPutts.length
  const makeWindow = makes.length / firstPutts.length
  const widestAimDegrees = widest ? aimDegrees(widest.aimIndex) : 0
  const approach = simulateRoll(puzzle, puzzle.approach.from, puzzle.approach.velocity)
  const chord = {
    x: approach.final.x - puzzle.approach.from.x,
    y: approach.final.y - puzzle.approach.from.y,
  }
  const chordLength = Math.sqrt(chord.x * chord.x + chord.y * chord.y)
  const chordUnit = chordLength === 0 ? { x: 0, y: 0 } : { x: chord.x / chordLength, y: chord.y / chordLength }
  let approachLateralDeflection = 0
  let strongestPuttPerpendicularDeflection = 0
  const putt = { x: puzzle.hole.x - puzzle.ball.x, y: puzzle.hole.y - puzzle.ball.y }
  const puttLength = Math.sqrt(putt.x * putt.x + putt.y * putt.y)
  const puttPerpendicular = puttLength === 0
    ? { x: 0, y: 0 }
    : { x: -putt.y / puttLength, y: putt.x / puttLength }
  for (const point of approach.path) {
    const relative = { x: point.x - puzzle.approach.from.x, y: point.y - puzzle.approach.from.y }
    const along = relative.x * chordUnit.x + relative.y * chordUnit.y
    const chordPoint = {
      x: puzzle.approach.from.x + chordUnit.x * along,
      y: puzzle.approach.from.y + chordUnit.y * along,
    }
    const deviation = { x: point.x - chordPoint.x, y: point.y - chordPoint.y }
    const lateral = chordUnit.x * deviation.y - chordUnit.y * deviation.x
    if (Math.abs(lateral) > Math.abs(approachLateralDeflection)) {
      approachLateralDeflection = lateral
      strongestPuttPerpendicularDeflection =
        deviation.x * puttPerpendicular.x + deviation.y * puttPerpendicular.y
    }
  }
  const approachHeadingLength = Math.sqrt(
    puzzle.approach.velocity.x ** 2 + puzzle.approach.velocity.y ** 2,
  )
  const approachEntryAngle = approachHeadingLength === 0 || puttLength === 0
    ? 0
    : (Math.acos(Math.max(-1, Math.min(1,
        (puzzle.approach.velocity.x * putt.x + puzzle.approach.velocity.y * putt.y) /
        (approachHeadingLength * puttLength),
      ))) * 180) / Math.PI
  const requiredAim = Math.tan((widestAimDegrees * Math.PI) / 180)
  const readAlignment = requiredAim === 0 || chordLength === 0
    ? 0
    : (strongestPuttPerpendicularDeflection / chordLength) / requiredAim
  const coherentMakeSet = components.length === 1
  const failures: string[] = []

  if (makeWindow < 0.003 || makeWindow > 0.025) failures.push('make-window')
  if (
    makes.some(
      ({ aimIndex, speedIndex }) =>
        aimIndex === 0 ||
        aimIndex === AIM_COUNT - 1 ||
        speedIndex === 0 ||
        speedIndex === SPEED_COUNT - 1,
    )
  ) {
    failures.push('make-window-boundary')
  }
  if (Math.abs(widestAimDegrees) < 2) failures.push('break-magnitude')
  if (!coherentMakeSet) failures.push('make-set-contiguity')
  if (forgiveness < 0.04) failures.push('forgiveness')
  if (restingRate < 0.9) failures.push('resting-rate')

  // The expensive sequence check only runs after the starting-position gates.
  const secondPutts =
    failures.length === 0
      ? validateSecondPutts(puzzle, firstPutts, options.secondPuttSamples ?? 20)
      : []
  const secondPassing = secondPutts.filter(
    ({ makeCount, makeWindow, canRest }) =>
      makeCount > 0 && makeWindow <= 0.15 && canRest,
  ).length
  const secondPuttPassRate = secondPassing / Math.max(1, secondPutts.length)
  if (secondPutts.length < Math.min(8, options.secondPuttSamples ?? 20)) failures.push('second-putt-sample')
  if (secondPuttPassRate < 0.9) failures.push('second-putt-gate')

  return {
    totalInputs: firstPutts.length,
    makeCount: makes.length,
    makeWindow,
    widestAimDegrees,
    approachLateralDeflection,
    approachEntryAngle,
    readAlignment,
    coherentMakeSet,
    componentCount: components.length,
    forgiveness,
    restingRate,
    secondPutts,
    secondPuttPassRate,
    passed: failures.length === 0,
    failures,
    makes,
  }
}
