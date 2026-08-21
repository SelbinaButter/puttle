import type { PuttResult, Vec2 } from '../sim'

export const TAP_IN_DISTANCE_FT = 1

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function canTapIn(ball: Vec2, hole: Vec2): boolean {
  return distanceBetween(ball, hole) <= TAP_IN_DISTANCE_FT
}

export function createTapInResult(ball: Vec2, hole: Vec2): PuttResult | undefined {
  const distance = distanceBetween(ball, hole)
  if (distance > TAP_IN_DISTANCE_FT) return undefined

  const elapsed = 0.35
  const speed = distance / elapsed
  return {
    holed: true,
    rested: false,
    lipOut: false,
    final: { ...hole },
    finalDistance: 0,
    elapsed,
    path: [
      { ...ball, t: 0, speed },
      { ...hole, t: elapsed, speed: 0 },
    ],
  }
}
