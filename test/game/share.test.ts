import { describe, expect, it } from 'vitest'
import { shareText } from '../../src/game/share'
import type { PlayedStroke } from '../../src/game/types'
import { TEST_PUZZLE } from '../fixtures/puzzle'

function stroke(holed: boolean, finalDistance: number): PlayedStroke {
  return {
    aimIndex: 30,
    speedIndex: 3,
    start: TEST_PUZZLE.ball,
    final: holed ? TEST_PUZZLE.hole : { x: TEST_PUZZLE.hole.x - finalDistance, y: TEST_PUZZLE.hole.y },
    finalDistance,
    holed,
    lipOut: false,
    elapsed: 2,
    path: [],
  }
}

describe('share card', () => {
  it('formats a win as a stable five-box row', () => {
    expect(shareText(TEST_PUZZLE, [stroke(false, 2), stroke(true, 0)])).toBe([
      '⛳ Puttle #1  2/5',
      '',
      '🟦🟩⬜⬜⬜',
      `20'0″ • Stimp 11.0`,
    ].join('\n'))
  })

  it('formats a five-putt practice loss and optional URL', () => {
    expect(shareText(
      TEST_PUZZLE,
      Array.from({ length: 5 }, () => stroke(false, 1)),
      { mode: 'practice', url: 'https://puttle.example' },
    )).toBe([
      '⛳ Puttle Practice #1  X/5',
      '',
      '🟦🟦🟦🟦🟥',
      `20'0″ • Stimp 11.0`,
      '',
      'https://puttle.example',
    ].join('\n'))
  })
})
