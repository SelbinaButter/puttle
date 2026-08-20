export interface Vec2 {
  x: number
  y: number
}

export interface Bump {
  center: Vec2
  radius: number
  height: number
}

export interface Tier {
  normal: Vec2
  offset: number
  height: number
  halfWidth: number
}

export interface GreenSurface {
  width: number
  height: number
  fringe: number
  tilt: Vec2
  bumps: Bump[]
  tier?: Tier
}

export interface PuzzleDefinition {
  version: 1
  date: string
  number: number
  stimp: number
  green: GreenSurface
  ball: Vec2
  hole: Vec2
}

export interface PathPoint extends Vec2 {
  t: number
  speed: number
}

export interface PuttResult {
  holed: boolean
  rested: boolean
  lipOut: boolean
  final: Vec2
  finalDistance: number
  elapsed: number
  path: PathPoint[]
}

export interface SimOptions {
  recordPath?: boolean
  maxSeconds?: number
  captureHole?: boolean
}
