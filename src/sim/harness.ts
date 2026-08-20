import { simulatePutt } from './simulate'
import type { PuzzleDefinition, Vec2 } from './types'

export interface HarnessInput {
  start: Vec2
  aimIndex: number
  speedIndex: number
}

export function runDeterminismHarness(puzzle: PuzzleDefinition, inputs: HarnessInput[]) {
  return inputs.map(({ start, aimIndex, speedIndex }) => {
    const result = simulatePutt(puzzle, start, aimIndex, speedIndex, { recordPath: false })
    return {
      holed: result.holed,
      rested: result.rested,
      lipOut: result.lipOut,
      x: result.final.x,
      y: result.final.y,
      distance: result.finalDistance,
      elapsed: result.elapsed,
    }
  })
}
