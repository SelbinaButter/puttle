import { heightAt, type PuzzleDefinition, type Vec2 } from '../sim'
import { formatFeet } from './share'
import type { PlayedStroke } from './types'

function closestPoint(point: Vec2, from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return from
  const ratio = Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
  ))
  return { x: from.x + dx * ratio, y: from.y + dy * ratio }
}

export function describeMiss(puzzle: PuzzleDefinition, stroke: PlayedStroke): string {
  const toHole = {
    x: puzzle.hole.x - stroke.start.x,
    y: puzzle.hole.y - stroke.start.y,
  }
  const length = Math.sqrt(toHole.x * toHole.x + toHole.y * toHole.y) || 1
  const pace =
    (stroke.final.x - puzzle.hole.x) * (toHole.x / length) +
    (stroke.final.y - puzzle.hole.y) * (toHole.y / length)

  let closest: Vec2 = stroke.path[0] ?? stroke.start
  let closestDistance = Number.POSITIVE_INFINITY
  for (let index = 1; index < stroke.path.length; index += 1) {
    const point = closestPoint(puzzle.hole, stroke.path[index - 1], stroke.path[index])
    const distance = Math.sqrt((point.x - puzzle.hole.x) ** 2 + (point.y - puzzle.hole.y) ** 2)
    if (distance < closestDistance) {
      closest = point
      closestDistance = distance
    }
  }

  const paceLabel = `${formatFeet(Math.abs(pace))} ${pace > 0 ? 'past' : 'short'}`
  if (closestDistance <= 4 / 12) return paceLabel
  const side = heightAt(puzzle.green, closest) > heightAt(puzzle.green, puzzle.hole)
    ? 'high side'
    : 'low side'
  return `${paceLabel} \u00b7 ${side}`
}
