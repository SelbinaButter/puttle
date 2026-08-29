import type { Vec2 } from '../sim'

export interface LabelLayout {
  left: number
  top: number
  width: number
  height: number
  textX: number
  textY: number
}

export function labelLayout(
  canvasWidth: number,
  canvasHeight: number,
  anchor: Vec2,
  measuredTextWidth: number,
  ratio: number,
): LabelLayout {
  const margin = 8 * ratio
  const horizontalPadding = 7 * ratio
  const height = 18 * ratio
  const availableWidth = Math.max(0, canvasWidth - margin * 2)
  const width = Math.min(measuredTextWidth + horizontalPadding * 2, availableWidth)
  const preferredLeft = anchor.x + 8 * ratio
  const left = Math.max(margin, Math.min(preferredLeft, canvasWidth - margin - width))
  const preferredTop = anchor.y - 20 * ratio
  const top = Math.max(margin, Math.min(preferredTop, canvasHeight - margin - height))
  return {
    left,
    top,
    width,
    height,
    textX: left + horizontalPadding,
    textY: top + 13 * ratio,
  }
}
