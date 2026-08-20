import {
  AIM_COUNT,
  AIM_UNIT_VECTORS,
  SPEED_COUNT,
  rollingAcceleration,
  speedPastFeet,
} from './constants'
import type { Vec2 } from './types'

export interface PhysicalPuttInput {
  direction: Vec2
  initialSpeed: number
  distance: number
  pastFeet: number
}

export function puttInput(
  start: Vec2,
  hole: Vec2,
  stimp: number,
  aimIndex: number,
  speedIndex: number,
): PhysicalPuttInput {
  if (!Number.isInteger(aimIndex) || aimIndex < 0 || aimIndex >= AIM_COUNT) {
    throw new RangeError(`aimIndex must be an integer from 0 to ${AIM_COUNT - 1}`)
  }
  if (!Number.isInteger(speedIndex) || speedIndex < 0 || speedIndex >= SPEED_COUNT) {
    throw new RangeError(`speedIndex must be an integer from 0 to ${SPEED_COUNT - 1}`)
  }

  const toHoleX = hole.x - start.x
  const toHoleY = hole.y - start.y
  const distance = Math.sqrt(toHoleX * toHoleX + toHoleY * toHoleY)
  if (distance === 0) {
    return { direction: { x: 0, y: 0 }, initialSpeed: 0, distance: 0, pastFeet: 0 }
  }

  const straightX = toHoleX / distance
  const straightY = toHoleY / distance
  const rotation = AIM_UNIT_VECTORS[aimIndex]
  const direction = {
    x: straightX * rotation.x - straightY * rotation.y,
    y: straightX * rotation.y + straightY * rotation.x,
  }
  const pastFeet = speedPastFeet(speedIndex)
  // IEEE-754 sqrt is correctly rounded. It is the only transcendental-like
  // operation in the canonical input conversion and must not be approximated.
  const initialSpeed = Math.sqrt(2 * rollingAcceleration(stimp) * (distance + pastFeet))
  return { direction, initialSpeed, distance, pastFeet }
}
