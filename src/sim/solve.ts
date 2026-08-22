import { AIM_COUNT, SPEED_COUNT } from './constants'
import { simulatePutt } from './simulate'
import { widestMarginMake, type MakeInput } from './solution'
import type { PathPoint, PuzzleDefinition } from './types'

export interface PuzzleSolution {
  paths: PathPoint[][]
  ideal?: MakeInput & { path: PathPoint[] }
}

export function solvePuzzle(puzzle: PuzzleDefinition): PuzzleSolution {
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
  return {
    paths,
    ideal: idealInput
      ? { ...idealInput, path: pathByInput.get(`${idealInput.aimIndex}:${idealInput.speedIndex}`) as PathPoint[] }
      : undefined,
  }
}
