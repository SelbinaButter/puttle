import { FIXED_DT, GRAVITY_FTPS2, HOLE_RADIUS_FT, rollingAcceleration } from './constants'
import { puttInput } from './input'
import { frictionMultiplier, sampleSurface } from './surface'
import type { PathPoint, PuzzleDefinition, PuttResult, SimOptions, Vec2 } from './types'

const REST_SPEED = 0.025
const STATIC_FRICTION_FACTOR = 1.08
const PATH_EVERY_STEPS = 4

function distanceBetween(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function closestPointOnSegment(point: Vec2, from: Vec2, to: Vec2): { point: Vec2; ratio: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { point: from, ratio: 0 }
  const raw = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared
  const ratio = Math.max(0, Math.min(1, raw))
  return { point: { x: from.x + ratio * dx, y: from.y + ratio * dy }, ratio }
}

function pathPoint(position: Vec2, time: number, velocityX: number, velocityY: number): PathPoint {
  return {
    x: position.x,
    y: position.y,
    t: time,
    speed: Math.sqrt(velocityX * velocityX + velocityY * velocityY),
  }
}

export function simulatePutt(
  puzzle: PuzzleDefinition,
  start: Vec2,
  aimIndex: number,
  speedIndex: number,
  options: SimOptions = {},
): PuttResult {
  const input = puttInput(start, puzzle.hole, puzzle.stimp, aimIndex, speedIndex)
  const recordPath = options.recordPath ?? true
  const captureHole = options.captureHole ?? true
  const maxSteps = Math.ceil((options.maxSeconds ?? 20) / FIXED_DT)
  let position = { ...start }
  let velocityX = input.direction.x * input.initialSpeed
  let velocityY = input.direction.y * input.initialSpeed
  let elapsed = 0
  let rested = false
  let holed = false
  let lipOut = false
  let holeCooldown = 0
  const path: PathPoint[] = recordPath ? [pathPoint(position, 0, velocityX, velocityY)] : []

  for (let step = 1; step <= maxSteps; step += 1) {
    const sample = sampleSurface(puzzle.green, position)
    const slopeAccelerationX = -GRAVITY_FTPS2 * sample.gradient.x
    const slopeAccelerationY = -GRAVITY_FTPS2 * sample.gradient.y
    const slopeMagnitude = Math.sqrt(
      slopeAccelerationX * slopeAccelerationX + slopeAccelerationY * slopeAccelerationY,
    )
    const friction =
      rollingAcceleration(puzzle.stimp) * frictionMultiplier(puzzle.green, position)
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY)

    if (speed < REST_SPEED && slopeMagnitude <= friction * STATIC_FRICTION_FACTOR) {
      velocityX = 0
      velocityY = 0
      rested = true
      elapsed = (step - 1) * FIXED_DT
      break
    }

    let accelerationX = slopeAccelerationX
    let accelerationY = slopeAccelerationY
    if (speed >= REST_SPEED) {
      accelerationX -= friction * (velocityX / speed)
      accelerationY -= friction * (velocityY / speed)
    } else if (slopeMagnitude > 0) {
      accelerationX -= friction * (slopeAccelerationX / slopeMagnitude)
      accelerationY -= friction * (slopeAccelerationY / slopeMagnitude)
    }

    const previousVelocityX = velocityX
    const previousVelocityY = velocityY
    velocityX += accelerationX * FIXED_DT
    velocityY += accelerationY * FIXED_DT

    if (
      previousVelocityX * velocityX + previousVelocityY * velocityY <= 0 &&
      slopeMagnitude <= friction * STATIC_FRICTION_FACTOR
    ) {
      velocityX = 0
      velocityY = 0
    }

    const previous = position
    const next = {
      x: position.x + velocityX * FIXED_DT,
      y: position.y + velocityY * FIXED_DT,
    }
    elapsed = step * FIXED_DT
    holeCooldown = Math.max(0, holeCooldown - FIXED_DT)

    if (captureHole && holeCooldown === 0) {
      const closest = closestPointOnSegment(puzzle.hole, previous, next)
      const offset = distanceBetween(closest.point, puzzle.hole)
      if (offset <= HOLE_RADIUS_FT) {
        const entrySpeed = Math.sqrt(velocityX * velocityX + velocityY * velocityY)
        const offsetRatio = offset / HOLE_RADIUS_FT
        const captureSpeed = 4.5 - 2.5 * offsetRatio * offsetRatio
        if (entrySpeed <= captureSpeed) {
          position = { ...puzzle.hole }
          elapsed = (step - 1 + closest.ratio) * FIXED_DT
          velocityX = 0
          velocityY = 0
          rested = true
          holed = true
          if (recordPath) path.push(pathPoint(position, elapsed, 0, 0))
          break
        }

        // Preserve most tangential speed while pushing the ball away from the
        // rim. This short deterministic deflection reads visually as a lip-out.
        let normalX = closest.point.x - puzzle.hole.x
        let normalY = closest.point.y - puzzle.hole.y
        const normalLength = Math.sqrt(normalX * normalX + normalY * normalY)
        if (normalLength > 0) {
          normalX /= normalLength
          normalY /= normalLength
        } else {
          const velocityLength = entrySpeed || 1
          normalX = -velocityY / velocityLength
          normalY = velocityX / velocityLength
        }
        const tangentX = -normalY
        const tangentY = normalX
        const tangentSpeed = velocityX * tangentX + velocityY * tangentY
        const outwardSpeed = Math.max(0.35, entrySpeed * 0.18)
        velocityX = tangentX * tangentSpeed * 0.82 + normalX * outwardSpeed
        velocityY = tangentY * tangentSpeed * 0.82 + normalY * outwardSpeed
        lipOut = true
        holeCooldown = 0.12
      }
    }

    position = next
    if (recordPath && step % PATH_EVERY_STEPS === 0) {
      path.push(pathPoint(position, elapsed, velocityX, velocityY))
    }
  }

  if (recordPath && !holed) {
    const last = path[path.length - 1]
    if (!last || last.x !== position.x || last.y !== position.y) {
      path.push(pathPoint(position, elapsed, velocityX, velocityY))
    }
  }

  return {
    holed,
    rested,
    lipOut,
    final: position,
    finalDistance: distanceBetween(position, puzzle.hole),
    elapsed,
    path,
  }
}
