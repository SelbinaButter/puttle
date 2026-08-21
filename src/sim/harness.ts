import { simulatePutt, simulateRoll } from './simulate'
import type { PuzzleDefinition, Vec2 } from './types'

export interface HarnessInput {
  start: Vec2
  aimIndex: number
  speedIndex: number
}

export function runApproachHarness(puzzle: PuzzleDefinition) {
  const result = simulateRoll(puzzle, puzzle.approach.from, puzzle.approach.velocity, {
    recordPath: false,
  })
  return {
    rested: result.rested,
    x: result.final.x,
    y: result.final.y,
    distance: result.finalDistance,
    elapsed: result.elapsed,
  }
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
