import { describe, expect, it } from 'vitest'
import { alignApproachPathEndpoint } from '../../src/game/approach'
import type { PathPoint } from '../../src/sim'

describe('approach path compatibility', () => {
  const path: PathPoint[] = [
    { x: 2, y: 4, t: 0, speed: 5 },
    { x: 5, y: 5, t: 1, speed: 3 },
    { x: 8, y: 6, t: 2, speed: 0 },
  ]

  it('smoothly aligns an old simulated path with its stored ball position', () => {
    const aligned = alignApproachPathEndpoint(path, { x: 9, y: 4 })

    expect(aligned[0]).toEqual(path[0])
    expect(aligned[1]).toEqual({ x: 5.5, y: 4, t: 1, speed: 3 })
    expect(aligned[2]).toEqual({ x: 9, y: 4, t: 2, speed: 0 })
    expect(path[2]).toEqual({ x: 8, y: 6, t: 2, speed: 0 })
  })

  it('reuses an already aligned path', () => {
    expect(alignApproachPathEndpoint(path, { x: 8, y: 6 })).toBe(path)
  })
})
