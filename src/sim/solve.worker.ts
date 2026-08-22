import { solvePuzzle } from './solve'
import type { PuzzleDefinition, Vec2 } from './types'

interface SolveRequest {
  puzzle: PuzzleDefinition
  strokeStarts: Vec2[]
}

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  self.postMessage(solvePuzzle(event.data.puzzle, event.data.strokeStarts))
}
