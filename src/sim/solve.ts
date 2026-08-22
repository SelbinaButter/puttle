import { AIM_COUNT, SPEED_COUNT } from './constants'
import { simulatePutt } from './simulate'
import { widestMarginMake, type MakeInput } from './solution'
import type { PathPoint, PuzzleDefinition, Vec2 } from './types'

export interface IdealPutt extends MakeInput {
  path: PathPoint[]
}

export interface PuzzleSolution {
  paths: PathPoint[][]
  ideal?: IdealPutt
  strokeIdeals: Array<IdealPutt | null>
}

function solveIdealFrom(puzzle: PuzzleDefinition, start: Vec2): IdealPutt | undefined {
  const makes: MakeInput[] = []
  for (let aimIndex = 0; aimIndex < AIM_COUNT; aimIndex += 1) {
    for (let speedIndex = 0; speedIndex < SPEED_COUNT; speedIndex += 1) {
      if (simulatePutt(puzzle, start, aimIndex, speedIndex, { recordPath: false }).holed) {
        makes.push({ aimIndex, speedIndex })
      }
    }
  }
  const ideal = widestMarginMake(makes)
  if (!ideal) return undefined
  return {
    ...ideal,
    path: simulatePutt(puzzle, start, ideal.aimIndex, ideal.speedIndex).path,
  }
}

export function solvePuzzle(puzzle: PuzzleDefinition, strokeStarts: Vec2[] = []): PuzzleSolution {
  const paths: PathPoint[][] = []
  const makes: MakeInput[] = []
  const pathByInput = new Map<string, PathPoint[]>()
  for (let aimIndex = 0; aimIndex < AIM_COUNT; aimIndex += 1) {
    for (let speedIndex = 0; speedIndex < SPEED_COUNT; speedIndex += 1) {
      const result = simulatePutt(puzzle, puzzle.ball, aimIndex, speedIndex)
      if (!result.holed) continue
      const input = { aimIndex, speedIndex }
      makes.push(input)
      paths.push(result.path)
      pathByInput.set(`${aimIndex}:${speedIndex}`, result.path)
    }
  }
  const idealInput = widestMarginMake(makes)
  const ideal = idealInput
    ? { ...idealInput, path: pathByInput.get(`${idealInput.aimIndex}:${idealInput.speedIndex}`) as PathPoint[] }
    : undefined
  const idealsByStart = new Map<string, IdealPutt | null>()
  const strokeIdeals = strokeStarts.map((start) => {
    const key = `${start.x}:${start.y}`
    if (idealsByStart.has(key)) return idealsByStart.get(key) as IdealPutt | null
    const fromOpeningBall = start.x === puzzle.ball.x && start.y === puzzle.ball.y
    const fromStart = fromOpeningBall ? ideal : solveIdealFrom(puzzle, start)
    const value = fromStart ?? null
    idealsByStart.set(key, value)
    return value
  })
  return {
    paths,
    ideal,
    strokeIdeals,
  }
}
