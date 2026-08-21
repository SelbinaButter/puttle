import { describe, expect, it } from 'vitest'
import { archiveDateFromUrl, gameUrl, shareGameUrl } from '../../src/game/links'

describe('game links', () => {
  it('reads a past archive date from a deep link', () => {
    expect(archiveDateFromUrl(
      'https://puttle.example/game/?archive=2026-08-20',
      '2026-08-21',
    )).toBe('2026-08-20')
  })

  it('ignores malformed, current, and future archive dates', () => {
    expect(archiveDateFromUrl('https://puttle.example/?archive=yesterday', '2026-08-21')).toBeUndefined()
    expect(archiveDateFromUrl('https://puttle.example/?archive=2026-08-21', '2026-08-21')).toBeUndefined()
    expect(archiveDateFromUrl('https://puttle.example/?archive=2026-08-22', '2026-08-21')).toBeUndefined()
  })

  it('links archive shares to their exact green', () => {
    expect(gameUrl(
      './',
      'https://puttle.example/game/?old=value#result',
      'archive',
      '2026-08-20',
    )).toBe('https://puttle.example/game/?archive=2026-08-20')
  })

  it('can link a practice share to its underlying archive green', () => {
    expect(shareGameUrl(
      './',
      'https://puttle.example/game/',
      'practice',
      '2026-08-17',
    )).toBe('https://puttle.example/game/?archive=2026-08-17')
  })

  it('keeps non-archive shares on the game root', () => {
    expect(gameUrl(
      './',
      'https://puttle.example/game/?archive=2026-08-20',
      'daily',
      '2026-08-21',
    )).toBe('https://puttle.example/game')
  })
})
