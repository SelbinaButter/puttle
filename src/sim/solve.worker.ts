import { solvePuzzle } from './solve'
import type { PuzzleDefinition } from './types'

self.onmessage = (event: MessageEvent<PuzzleDefinition>) => {
  self.postMessage(solvePuzzle(event.data))
}
