import { describe, expect, it } from 'vitest'
import { describeMiss } from '../../src/game/feedback'
import type { PlayedStroke } from '../../src/game/types'
import { TEST_PUZZLE } from '../fixtures/puzzle'

describe('miss feedback', () => {
  it('reports pace and the high side from the observed closest approach', () => {
    const puzzle = { ...TEST_PUZZLE, green: { ...TEST_PUZZLE.green, tilt: { x: 0, y: 0.02 } } }
    const stroke: PlayedStroke = {
      aimIndex: 30,
      speedIndex: 10,
      start: puzzle.ball,
      final: { x: puzzle.hole.x + 2, y: puzzle.hole.y + 1 },
      finalDistance: Math.sqrt(5),
      holed: false,
      lipOut: false,
      elapsed: 2,
      path: [
        { ...puzzle.ball, t: 0, speed: 5 },
        { x: puzzle.hole.x, y: puzzle.hole.y + 1, t: 1, speed: 2 },
        { x: puzzle.hole.x + 2, y: puzzle.hole.y + 1, t: 2, speed: 0 },
      ],
    }
    expect(describeMiss(puzzle, stroke)).toBe('2\'0\u2033 past \u00b7 high side')
  })

  it('suppresses side feedback for a nearly on-line miss', () => {
    const stroke: PlayedStroke = {
      aimIndex: 30,
      speedIndex: 10,
      start: TEST_PUZZLE.ball,
      final: { x: TEST_PUZZLE.hole.x - 2, y: TEST_PUZZLE.hole.y },
      finalDistance: 2,
      holed: false,
      lipOut: false,
      elapsed: 2,
      path: [
        { ...TEST_PUZZLE.ball, t: 0, speed: 5 },
        { x: TEST_PUZZLE.hole.x - 0.2, y: TEST_PUZZLE.hole.y, t: 1, speed: 1 },
        { x: TEST_PUZZLE.hole.x - 2, y: TEST_PUZZLE.hole.y, t: 2, speed: 0 },
      ],
    }
    expect(describeMiss(TEST_PUZZLE, stroke)).toBe('2\'0\u2033 short')
  })
})
