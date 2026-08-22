import { AIM_COUNT, AIM_MIN_DEGREES, AIM_STEP_DEGREES, type Vec2 } from '../sim'

export function aimIndexFromPoints(ball: Vec2, hole: Vec2, pointer: Vec2): number | undefined {
  const straightX = hole.x - ball.x
  const straightY = hole.y - ball.y
  const pointerX = pointer.x - ball.x
  const pointerY = pointer.y - ball.y
  const straightLength = Math.hypot(straightX, straightY)
  const pointerLength = Math.hypot(pointerX, pointerY)
  if (straightLength === 0 || pointerLength < 8) return undefined

  const cross = straightX * pointerY - straightY * pointerX
  const dot = straightX * pointerX + straightY * pointerY
  const rawDegrees = (Math.atan2(cross, dot) * 180) / Math.PI
  const clampedDegrees = Math.max(
    AIM_MIN_DEGREES,
    Math.min(AIM_MIN_DEGREES + (AIM_COUNT - 1) * AIM_STEP_DEGREES, rawDegrees),
  )
  return Math.round((clampedDegrees - AIM_MIN_DEGREES) / AIM_STEP_DEGREES)
}

export function aimIndexFromDrag(
  startIndex: number,
  perpendicularPixels: number,
  pixelsPerDegree: number,
): number {
  if (pixelsPerDegree <= 0) return startIndex
  const indexDelta = Math.round(
    perpendicularPixels / pixelsPerDegree / AIM_STEP_DEGREES,
  )
  return Math.max(0, Math.min(AIM_COUNT - 1, startIndex + indexDelta))
}
