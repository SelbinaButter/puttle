import type { PathPoint, Vec2 } from '../sim'

/**
 * Keeps archived approach replays compatible with the simulator version that
 * originally generated their stored ball position.
 */
export function alignApproachPathEndpoint(path: PathPoint[], target: Vec2): PathPoint[] {
  const endpoint = path.at(-1)
  if (!endpoint) return path

  const offsetX = target.x - endpoint.x
  const offsetY = target.y - endpoint.y
  if (offsetX === 0 && offsetY === 0) return path

  const startTime = path[0].t
  const duration = endpoint.t - startTime
  return path.map((point, index) => {
    const rawProgress = duration > 0
      ? (point.t - startTime) / duration
      : path.length > 1 ? index / (path.length - 1) : 1
    const progress = Math.max(0, Math.min(1, rawProgress))
    const blend = progress * progress * (3 - 2 * progress)
    return {
      ...point,
      x: point.x + offsetX * blend,
      y: point.y + offsetY * blend,
    }
  })
}
