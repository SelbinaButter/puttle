import type { GreenSurface, Vec2 } from './types'

export interface SurfaceSample {
  height: number
  gradient: Vec2
}

export function sampleSurface(surface: GreenSurface, point: Vec2): SurfaceSample {
  let height = surface.tilt.x * point.x + surface.tilt.y * point.y
  let gradientX = surface.tilt.x
  let gradientY = surface.tilt.y

  for (const bump of surface.bumps) {
    const dx = point.x - bump.center.x
    const dy = point.y - bump.center.y
    const radiusSquared = bump.radius * bump.radius
    const rSquared = (dx * dx + dy * dy) / radiusSquared
    if (rSquared < 1) {
      const q = 1 - rSquared
      const qSquared = q * q
      height += bump.height * qSquared * q
      const derivative = (-6 * bump.height * qSquared) / radiusSquared
      gradientX += derivative * dx
      gradientY += derivative * dy
    }
  }

  const tier = surface.tier
  if (tier) {
    const signedDistance =
      tier.normal.x * point.x + tier.normal.y * point.y - tier.offset
    if (signedDistance >= tier.halfWidth) {
      height += tier.height
    } else if (signedDistance > -tier.halfWidth) {
      const u = (signedDistance + tier.halfWidth) / (2 * tier.halfWidth)
      const smooth = u * u * (3 - 2 * u)
      const derivative = (tier.height * (6 * u - 6 * u * u)) / (2 * tier.halfWidth)
      height += tier.height * smooth
      gradientX += derivative * tier.normal.x
      gradientY += derivative * tier.normal.y
    }
  }

  return { height, gradient: { x: gradientX, y: gradientY } }
}

export function heightAt(surface: GreenSurface, point: Vec2): number {
  return sampleSurface(surface, point).height
}

export function frictionMultiplier(surface: GreenSurface, point: Vec2): number {
  const onGreen =
    point.x >= 0 &&
    point.x <= surface.width &&
    point.y >= 0 &&
    point.y <= surface.height
  if (onGreen) return 1

  const onFringe =
    point.x >= -surface.fringe &&
    point.x <= surface.width + surface.fringe &&
    point.y >= -surface.fringe &&
    point.y <= surface.height + surface.fringe
  return onFringe ? 3.5 : 8
}
