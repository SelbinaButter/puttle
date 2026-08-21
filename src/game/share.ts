import type { PuzzleDefinition } from '../sim'
import { MAX_PUTTS } from './constants'
import type { PlayedStroke } from './types'
import { BRAND } from './brand'

export type ShareMode = 'daily' | 'archive' | 'practice'

export function formatFeet(feet: number): string {
  const totalInches = Math.max(0, Math.round(feet * 12))
  const wholeFeet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  return `${wholeFeet}'${inches}\u2033`
}

export function shareText(
  puzzle: PuzzleDefinition,
  strokes: PlayedStroke[],
  options: { mode?: ShareMode; url?: string } = {},
): string {
  const won = strokes.at(-1)?.holed ?? false
  const modeName = options.mode === 'archive'
    ? ' Archive'
    : options.mode === 'practice' ? ' Practice' : ''
  const score = won ? `${strokes.length}/${MAX_PUTTS}` : `X/${MAX_PUTTS}`
  const boxes = Array.from({ length: MAX_PUTTS }, (_, index) => {
    const stroke = strokes[index]
    if (!stroke) return '\u2b1c'
    if (stroke.holed) return '\ud83d\udfe9'
    if (index === MAX_PUTTS - 1) return '\ud83d\udfe5'
    return '\ud83d\udfe6'
  }).join('')
  const initialDistance = Math.sqrt(
    (puzzle.hole.x - puzzle.ball.x) ** 2 +
    (puzzle.hole.y - puzzle.ball.y) ** 2,
  )
  const lines = [
    `${BRAND.sharePrefix}${modeName} #${puzzle.number}  ${score}`,
    '',
    boxes,
    `${formatFeet(initialDistance)} \u2022 Stimp ${puzzle.stimp.toFixed(1)}`,
  ]
  if (options.url) lines.push('', options.url)
  return lines.join('\n')
}
