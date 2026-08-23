import {
  AIM_COUNT,
  ROLLING_SLOPE_FACTOR,
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

export interface DoubleBreakMetric {
  detected: boolean
  positiveDegrees: number
  negativeDegrees: number
  positiveSpan: number
  negativeSpan: number
}

export interface SecondPuttMetric {
  start: Vec2
  distance: number
  makeCount: number
  makeWindow: number
  canRest: boolean
  neutralMake: boolean
}

export interface NeutralStrategyMetric {
  strokes: number | null
  firstLeave: number
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
  neutralSecondMakeRate: number
  neutralStrategy: NeutralStrategyMetric
  distance: number
  bearing: number
  maxLocalGrade: number
  maxCupGrade: number
  edgeClearance: number
  doubleBreak: DoubleBreakMetric
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

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function normalizeDegrees(value: number): number {
  let result = value
  while (result <= -180) result += 360
  while (result > 180) result -= 360
  return result
}

function pointAtDistance(path: Vec2[], cumulative: number[], target: number): Vec2 {
  let index = 1
  while (index < cumulative.length && cumulative[index] < target) index += 1
  if (index >= path.length) return path[path.length - 1]
  const span = cumulative[index] - cumulative[index - 1]
  const ratio = span === 0 ? 0 : (target - cumulative[index - 1]) / span
  return {
    x: path[index - 1].x + (path[index].x - path[index - 1].x) * ratio,
    y: path[index - 1].y + (path[index].y - path[index - 1].y) * ratio,
  }
}

export function detectDoubleBreak(path: Vec2[]): DoubleBreakMetric {
  if (path.length < 3) {
    return { detected: false, positiveDegrees: 0, negativeDegrees: 0, positiveSpan: 0, negativeSpan: 0 }
  }
  const cumulative = [0]
  for (let index = 1; index < path.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distanceBetween(path[index - 1], path[index]))
  }
  // Fixed one-foot travel intervals suppress simulation-step noise. The last
  // 1.5 feet are excluded so the cup-capture snap cannot create a false turn.
  const usableLength = cumulative.at(-1) as number - 1.5
  if (usableLength < 8) {
    return { detected: false, positiveDegrees: 0, negativeDegrees: 0, positiveSpan: 0, negativeSpan: 0 }
  }
  const sampled: Vec2[] = []
  for (let distance = 0; distance <= usableLength; distance += 1) {
    sampled.push(pointAtDistance(path, cumulative, distance))
  }
  const headings: number[] = []
  for (let index = 1; index < sampled.length; index += 1) {
    headings.push(Math.atan2(
      sampled[index].y - sampled[index - 1].y,
      sampled[index].x - sampled[index - 1].x,
    ) * 180 / Math.PI)
  }
  const phases: Array<{ sign: -1 | 1; degrees: number; span: number }> = []
  for (let index = 1; index < headings.length; index += 1) {
    const turn = normalizeDegrees(headings[index] - headings[index - 1])
    if (Math.abs(turn) < 0.015) continue
    const sign: -1 | 1 = turn < 0 ? -1 : 1
    const current = phases.at(-1)
    if (current?.sign === sign) {
      current.degrees += Math.abs(turn)
      current.span += 1
    } else {
      phases.push({ sign, degrees: Math.abs(turn), span: 1 })
    }
  }
  const positive = phases.filter((phase) => phase.sign === 1 && phase.span >= 4)
    .sort((a, b) => b.degrees - a.degrees)[0]
  const negative = phases.filter((phase) => phase.sign === -1 && phase.span >= 4)
    .sort((a, b) => b.degrees - a.degrees)[0]
  return {
    detected: Boolean(positive && negative && positive.degrees >= 1 && negative.degrees >= 1),
    positiveDegrees: positive?.degrees ?? 0,
    negativeDegrees: negative?.degrees ?? 0,
    positiveSpan: positive?.span ?? 0,
    negativeSpan: negative?.span ?? 0,
  }
}

function gradeMetrics(puzzle: PuzzleDefinition): { maxLocalGrade: number; maxCupGrade: number } {
  let maxLocalGrade = 0
  for (let y = 0; y <= puzzle.green.height; y += 1.5) {
    for (let x = 0; x <= puzzle.green.width; x += 1.5) {
      const gradient = sampleSurface(puzzle.green, { x, y }).gradient
      maxLocalGrade = Math.max(maxLocalGrade, Math.hypot(gradient.x, gradient.y))
    }
  }
  let maxCupGrade = 0
  for (let radius = 0; radius <= 3; radius += 0.5) {
    const samples = radius === 0 ? 1 : 24
    for (let index = 0; index < samples; index += 1) {
      const angle = index * Math.PI * 2 / samples
      const point = {
        x: puzzle.hole.x + Math.cos(angle) * radius,
        y: puzzle.hole.y + Math.sin(angle) * radius,
      }
      const gradient = sampleSurface(puzzle.green, point).gradient
      maxCupGrade = Math.max(maxCupGrade, Math.hypot(gradient.x, gradient.y))
    }
  }
  return { maxLocalGrade, maxCupGrade }
}

function minimumEdgeClearance(puzzle: PuzzleDefinition): number {
  const points: Vec2[] = [puzzle.ball, puzzle.hole, puzzle.approach.from]
  const approach = simulateRoll(puzzle, puzzle.approach.from, puzzle.approach.velocity)
  points.push(...approach.path)
  return Math.min(...points.flatMap((point) => [
    point.x,
    point.y,
    puzzle.green.width - point.x,
    puzzle.green.height - point.y,
  ]))
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
    ) * ROLLING_SLOPE_FACTOR
    const canRest = slopeForce <= rollingAcceleration(puzzle.stimp) * 1.08
    const neutralMake = result.finalDistance <= 1 ||
      simulatePutt(puzzle, result.final, 30, 10, { recordPath: false }).holed
    return {
      start: result.final,
      distance: result.finalDistance,
      makeCount,
      makeWindow: makeCount / (AIM_COUNT * SPEED_COUNT),
      canRest,
      neutralMake,
    }
  })
}

function simulateNeutralStrategy(
  puzzle: PuzzleDefinition,
  firstResult: PuttResult,
): NeutralStrategyMetric {
  let start = puzzle.ball
  let firstLeave = firstResult.finalDistance
  for (let stroke = 1; stroke <= 5; stroke += 1) {
    const remaining = distanceBetween(start, puzzle.hole)
    if (remaining <= 1) return { strokes: stroke, firstLeave }
    const result = stroke === 1
      ? firstResult
      : simulatePutt(puzzle, start, 30, 10, { recordPath: false })
    if (stroke === 1) firstLeave = result.finalDistance
    if (result.holed) return { strokes: stroke, firstLeave }
    start = result.final
  }
  return { strokes: null, firstLeave }
}

export function validatePuzzle(
  puzzle: PuzzleDefinition,
  options: {
    secondPuttSamples?: number
    expectedContour?: 'conventional' | 'double'
    expectedNeutralTwoPutt?: boolean
  } = {},
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
  const neutralFirst = firstPutts.find(({ aimIndex, speedIndex }) =>
    aimIndex === 30 && speedIndex === 10)?.result as PuttResult
  const neutralStrategy = simulateNeutralStrategy(puzzle, neutralFirst)
  const idealResult = widest
    ? simulatePutt(puzzle, puzzle.ball, widest.aimIndex, widest.speedIndex)
    : undefined
  const doubleBreak = detectDoubleBreak(idealResult?.path ?? [])
  const { maxLocalGrade, maxCupGrade } = gradeMetrics(puzzle)
  const edgeClearance = minimumEdgeClearance(puzzle)
  const distance = distanceBetween(puzzle.ball, puzzle.hole)
  const bearing = (Math.atan2(
    puzzle.hole.y - puzzle.ball.y,
    puzzle.hole.x - puzzle.ball.x,
  ) * 180 / Math.PI + 360) % 360
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
  if (maxLocalGrade > 0.035) failures.push('local-grade')
  if (maxCupGrade > 0.02) failures.push('cup-grade')
  if (edgeClearance < 1.25) failures.push('edge-clearance')
  if (options.expectedContour === 'double' && !doubleBreak.detected) failures.push('double-break-missing')
  if (options.expectedContour === 'conventional' && doubleBreak.detected) failures.push('accidental-double-break')
  if (options.expectedNeutralTwoPutt === true && neutralStrategy.strokes !== 2) {
    failures.push('neutral-strategy-too-hard')
  }
  if (options.expectedNeutralTwoPutt === false && neutralStrategy.strokes !== null && neutralStrategy.strokes <= 2) {
    failures.push('neutral-strategy-too-easy')
  }

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
  const neutralSecondMakeRate = secondPutts.filter(({ neutralMake }) => neutralMake).length /
    Math.max(1, secondPutts.length)
  if (secondPutts.length > 0) {
    if (secondPutts.length < Math.min(8, options.secondPuttSamples ?? 20)) failures.push('second-putt-sample')
    if (secondPuttPassRate < 0.9) failures.push('second-putt-gate')
    if (neutralSecondMakeRate > 0.75) failures.push('neutral-second-too-easy')
  }

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
    neutralSecondMakeRate,
    neutralStrategy,
    distance,
    bearing,
    maxLocalGrade,
    maxCupGrade,
    edgeClearance,
    doubleBreak,
    passed: failures.length === 0,
    failures,
    makes,
  }
}
