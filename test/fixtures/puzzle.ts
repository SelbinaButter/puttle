import type { PuzzleDefinition } from '../../src/sim'

export const TEST_PUZZLE: PuzzleDefinition = {
  version: 2,
  date: '2026-01-01',
  number: 1,
  stimp: 11,
  green: {
    width: 42,
    height: 30,
    fringe: 3,
    tilt: { x: 0, y: 0 },
    bumps: [],
  },
  approach: {
    from: { x: 8, y: 5 },
    velocity: { x: 0, y: 5.724222488038285 },
  },
  ball: { x: 8, y: 15.000000000000004 },
  hole: { x: 28, y: 15 },
}
