import { describe, expect, it } from 'vitest'
import { localDate, previousDate } from '../../src/game/date'

describe('local dates', () => {
  it('rolls over at midnight in the player’s local time', () => {
    expect(localDate(new Date(2026, 7, 20, 23, 59, 59))).toBe('2026-08-20')
    expect(localDate(new Date(2026, 7, 21, 0, 0, 0))).toBe('2026-08-21')
  })

  it('walks backward across month boundaries', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28')
  })
})
