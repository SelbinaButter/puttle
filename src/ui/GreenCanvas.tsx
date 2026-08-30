import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { HOLE_RADIUS_FT, heightAt, puttInput, sampleSurface, type PathPoint, type PuzzleDefinition, type Vec2 } from '../sim'
import { aimIndexFromDrag, aimIndexFromPoints, speedIndexFromDrag } from '../game/aim'
import { alignApproachPathEndpoint } from '../game/approach'
import type { PlayedStroke } from '../game/types'
import { labelLayout } from '../game/canvasLayout'

interface Props {
  puzzle: PuzzleDefinition
  strokes: PlayedStroke[]
  ball: Vec2
  aimIndex: number
  speedIndex: number
  aimEnabled: boolean
  onAimIndexChange: (index: number) => void
  onSpeedIndexChange: (index: number) => void
  approachPath: PathPoint[]
  approachTrailUntil?: number
  animationKind?: 'approach' | 'putt'
  activePath?: PathPoint[]
  animationTime?: number
  revealPaths: PathPoint[][]
  idealPath?: PathPoint[]
  idealLabel?: string
  revealed: boolean
}

interface Transform {
  scale: number
  offsetX: number
  offsetY: number
  originX: number
  originY: number
  worldWidth: number
  worldHeight: number
  zoomed: boolean
}

interface ReviewCamera {
  zoom: number
  center: Vec2
}

interface CameraGesture {
  startDistance: number
  startZoom: number
  worldFocus: Vec2
}

interface LastTap {
  time: number
  position: Vec2
  aimIndex?: number
  speedIndex?: number
}

interface CanvasPositionEvent {
  currentTarget: HTMLCanvasElement
  clientX: number
  clientY: number
}

interface AimDrag {
  pointerId: number
  start: Vec2
  startIndex: number
  startSpeedIndex: number
  startRadius: number
  pixelRatio: number
  relative: boolean
}

// A regulation ball is 1.68 inches in diameter. Dividing by 24 converts that
// diameter in inches directly to a radius in feet.
const BALL_RADIUS_FT = 1.68 / 24
const CLOSE_CAMERA_DISTANCE_FT = 10
const MAX_CAMERA_ZOOM = 4
const TOUCH_CAMERA_HINT_KEY = 'puttle:camera-hint:v1'

function usesCloseCamera(puzzle: PuzzleDefinition, ball: Vec2, allowed: boolean): boolean {
  return allowed && Math.hypot(puzzle.hole.x - ball.x, puzzle.hole.y - ball.y) < CLOSE_CAMERA_DISTANCE_FT
}

function fixedCloseCameraBall(start: Vec2, hole: Vec2): Vec2 {
  const dx = start.x - hole.x
  const dy = start.y - hole.y
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { x: hole.x - CLOSE_CAMERA_DISTANCE_FT, y: hole.y }
  return {
    x: hole.x + (dx / distance) * CLOSE_CAMERA_DISTANCE_FT,
    y: hole.y + (dy / distance) * CLOSE_CAMERA_DISTANCE_FT,
  }
}

function transformFor(
  canvas: HTMLCanvasElement,
  puzzle: PuzzleDefinition,
  ball: Vec2,
  allowCloseZoom: boolean,
  corridorPoints: readonly Vec2[] = [],
  reviewCamera?: ReviewCamera,
  forceCloseZoom = false,
): Transform {
  const fringe = puzzle.green.fringe + 0.8
  const full = {
    minimumX: -fringe,
    maximumX: puzzle.green.width + fringe,
    minimumY: -fringe,
    maximumY: puzzle.green.height + fringe,
  }
  const dx = puzzle.hole.x - ball.x
  const dy = puzzle.hole.y - ball.y
  const zoomed = allowCloseZoom && (
    forceCloseZoom || usesCloseCamera(puzzle, ball, true)
  )
  let originX = full.minimumX
  let originY = full.minimumY
  let worldWidth = full.maximumX - full.minimumX
  let worldHeight = full.maximumY - full.minimumY

  if (reviewCamera && reviewCamera.zoom > 1) {
    worldWidth /= reviewCamera.zoom
    worldHeight /= reviewCamera.zoom
    originX = Math.max(
      full.minimumX,
      Math.min(full.maximumX - worldWidth, reviewCamera.center.x - worldWidth / 2),
    )
    originY = Math.max(
      full.minimumY,
      Math.min(full.maximumY - worldHeight, reviewCamera.center.y - worldHeight / 2),
    )
  } else if (zoomed) {
    const corridorLength = Math.hypot(dx, dy)
    const padding = Math.max(4.5, corridorLength * 0.16)
    const framingPoints = [ball, puzzle.hole, ...corridorPoints]
    const minimumX = Math.min(...framingPoints.map((point) => point.x))
    const maximumX = Math.max(...framingPoints.map((point) => point.x))
    const minimumY = Math.min(...framingPoints.map((point) => point.y))
    const maximumY = Math.max(...framingPoints.map((point) => point.y))
    const centerX = (minimumX + maximumX) / 2
    const centerY = (minimumY + maximumY) / 2
    worldWidth = Math.max(8, maximumX - minimumX + padding * 2)
    worldHeight = Math.max(8, maximumY - minimumY + padding * 2)
    const canvasAspect = canvas.width / canvas.height
    if (worldWidth / worldHeight < canvasAspect) {
      worldWidth = worldHeight * canvasAspect
    } else {
      worldHeight = worldWidth / canvasAspect
    }
    worldWidth = Math.min(worldWidth, full.maximumX - full.minimumX)
    worldHeight = Math.min(worldHeight, full.maximumY - full.minimumY)
    originX = Math.max(
      full.minimumX,
      Math.min(full.maximumX - worldWidth, centerX - worldWidth / 2),
    )
    originY = Math.max(
      full.minimumY,
      Math.min(full.maximumY - worldHeight, centerY - worldHeight / 2),
    )
  }

  const scale = Math.min(canvas.width / worldWidth, canvas.height / worldHeight)
  return {
    scale,
    offsetX: (canvas.width - worldWidth * scale) / 2,
    offsetY: (canvas.height - worldHeight * scale) / 2,
    originX,
    originY,
    worldWidth,
    worldHeight,
    zoomed,
  }
}

function screen(point: Vec2, transform: Transform): Vec2 {
  return {
    x: transform.offsetX + (point.x - transform.originX) * transform.scale,
    y: transform.offsetY + (point.y - transform.originY) * transform.scale,
  }
}

function drawPath(
  context: CanvasRenderingContext2D,
  path: PathPoint[],
  transform: Transform,
  color: string,
  width: number,
  until = Number.POSITIVE_INFINITY,
) {
  if (path.length < 2) return
  context.beginPath()
  let began = false
  let lastDrawn: Vec2 | undefined
  for (const point of path) {
    if (point.t > until) break
    const pixel = screen(point, transform)
    if (!began) {
      context.moveTo(pixel.x, pixel.y)
      began = true
    } else {
      context.lineTo(pixel.x, pixel.y)
    }
    lastDrawn = point
  }
  // Recorded paths are intentionally sparse. The animated ball is
  // interpolated between those samples, so the partial trail must use the
  // same interpolation or it visibly lags behind the ball at the handoff.
  if (began && Number.isFinite(until)) {
    const endpoint = interpolatedBall(path, until)
    if (
      endpoint &&
      (!lastDrawn || endpoint.x !== lastDrawn.x || endpoint.y !== lastDrawn.y)
    ) {
      const pixel = screen(endpoint, transform)
      context.lineTo(pixel.x, pixel.y)
    }
  }
  context.strokeStyle = color
  context.lineWidth = width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.stroke()
}

function interpolatedBall(path: PathPoint[], time: number): Vec2 | undefined {
  if (path.length === 0) return undefined
  let previous = path[0]
  for (let index = 1; index < path.length; index += 1) {
    const next = path[index]
    if (next.t >= time) {
      const span = next.t - previous.t
      const ratio = span === 0 ? 1 : (time - previous.t) / span
      return {
        x: previous.x + (next.x - previous.x) * ratio,
        y: previous.y + (next.y - previous.y) * ratio,
      }
    }
    previous = next
  }
  return path[path.length - 1]
}

function puttNeedsCloseUp(path: PathPoint[], time: number, hole: Vec2): boolean {
  const current = interpolatedBall(path, time)
  if (current && Math.hypot(hole.x - current.x, hole.y - current.y) < CLOSE_CAMERA_DISTANCE_FT) {
    return true
  }
  return path.some((point) => (
    point.t <= time &&
    Math.hypot(hole.x - point.x, hole.y - point.y) < CLOSE_CAMERA_DISTANCE_FT
  ))
}

function drawContours(
  context: CanvasRenderingContext2D,
  puzzle: PuzzleDefinition,
  transform: Transform,
) {
  const columns = 30
  const rows = 24
  const values: number[][] = []
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (let row = 0; row <= rows; row += 1) {
    values[row] = []
    for (let column = 0; column <= columns; column += 1) {
      const value = heightAt(puzzle.green, {
        x: (column / columns) * puzzle.green.width,
        y: (row / rows) * puzzle.green.height,
      })
      values[row][column] = value
      minimum = Math.min(minimum, value)
      maximum = Math.max(maximum, value)
    }
  }

  context.strokeStyle = 'rgba(236, 249, 214, .38)'
  context.lineWidth = 1
  for (let levelIndex = 1; levelIndex < 9; levelIndex += 1) {
    const level = minimum + ((maximum - minimum) * levelIndex) / 9
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const corners = [
          { x: column, y: row, value: values[row][column] },
          { x: column + 1, y: row, value: values[row][column + 1] },
          { x: column + 1, y: row + 1, value: values[row + 1][column + 1] },
          { x: column, y: row + 1, value: values[row + 1][column] },
        ]
        const crossings: Vec2[] = []
        for (let edge = 0; edge < 4; edge += 1) {
          const a = corners[edge]
          const b = corners[(edge + 1) % 4]
          if ((a.value < level) === (b.value < level) || a.value === b.value) continue
          const ratio = (level - a.value) / (b.value - a.value)
          crossings.push({
            x: ((a.x + (b.x - a.x) * ratio) / columns) * puzzle.green.width,
            y: ((a.y + (b.y - a.y) * ratio) / rows) * puzzle.green.height,
          })
        }
        if (crossings.length >= 2) {
          for (let index = 0; index + 1 < crossings.length; index += 2) {
            const a = screen(crossings[index], transform)
            const b = screen(crossings[index + 1], transform)
            context.beginPath()
            context.moveTo(a.x, a.y)
            context.lineTo(b.x, b.y)
            context.stroke()
          }
        }
      }
    }
  }
}

function drawFallLineArrows(
  context: CanvasRenderingContext2D,
  puzzle: PuzzleDefinition,
  transform: Transform,
  ratio: number,
) {
  context.strokeStyle = 'rgba(210, 235, 196, .55)'
  context.fillStyle = 'rgba(210, 235, 196, .55)'
  context.lineWidth = 1.2 * ratio
  for (let row = 1; row <= 4; row += 1) {
    for (let column = 1; column <= 5; column += 1) {
      const point = {
        x: (column / 6) * puzzle.green.width,
        y: (row / 5) * puzzle.green.height,
      }
      const gradient = sampleSurface(puzzle.green, point).gradient
      const magnitude = Math.sqrt(gradient.x * gradient.x + gradient.y * gradient.y)
      if (magnitude < 0.0005) continue
      const from = screen(point, transform)
      const length = 10 * ratio
      const direction = { x: -gradient.x / magnitude, y: -gradient.y / magnitude }
      const to = { x: from.x + direction.x * length, y: from.y + direction.y * length }
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
      context.beginPath()
      context.moveTo(to.x, to.y)
      context.lineTo(to.x - direction.x * 3.5 * ratio - direction.y * 2.5 * ratio, to.y - direction.y * 3.5 * ratio + direction.x * 2.5 * ratio)
      context.lineTo(to.x - direction.x * 3.5 * ratio + direction.y * 2.5 * ratio, to.y - direction.y * 3.5 * ratio - direction.x * 2.5 * ratio)
      context.closePath()
      context.fill()
    }
  }
}

function drawCup(
  context: CanvasRenderingContext2D,
  center: Vec2,
  radius: number,
  ratio: number,
) {
  context.save()
  context.fillStyle = '#0b1810'
  context.beginPath()
  context.arc(center.x, center.y, radius, 0, Math.PI * 2)
  context.fill()

  const inset = Math.max(0, radius - 0.45 * ratio)
  if (inset > 0) {
    const depth = context.createRadialGradient(
      center.x - radius * 0.3,
      center.y - radius * 0.38,
      radius * 0.08,
      center.x,
      center.y,
      inset,
    )
    depth.addColorStop(0, '#26382b')
    depth.addColorStop(0.5, '#142219')
    depth.addColorStop(1, '#07100b')
    context.fillStyle = depth
    context.beginPath()
    context.arc(center.x, center.y, inset, 0, Math.PI * 2)
    context.fill()
  }

  context.lineCap = 'round'
  // Show the pale liner in every camera. The shared legibility scale keeps it
  // readable even in the full-green view, so switching back to a flat black
  // marker there only made the cup appear larger and stylistically unrelated.
  const linerWidth = Math.min(1.35 * ratio, Math.max(0.8 * ratio, radius * 0.16))
  const linerRadius = Math.max(0, radius - 0.8 * ratio - linerWidth / 2)
  if (linerRadius > 0) {
    context.strokeStyle = 'rgba(229, 232, 214, .82)'
    context.lineWidth = linerWidth
    context.beginPath()
    context.arc(center.x, center.y, linerRadius, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = 'rgba(64, 76, 65, .42)'
    context.lineWidth = 0.45 * ratio
    context.beginPath()
    context.arc(center.x, center.y, linerRadius - linerWidth * 0.55, 0, Math.PI)
    context.stroke()
  }
  context.restore()
}

function drawFlag(
  context: CanvasRenderingContext2D,
  hole: Vec2,
  ratio: number,
  brandMark: HTMLImageElement | undefined,
) {
  const base = hole.y + ratio
  const top = base - 64 * ratio
  context.save()
  context.lineCap = 'butt'

  // A centered flat outline keeps the thin pole readable without making it
  // look glossy or shifting its visual weight to either side.
  context.strokeStyle = '#334b37'
  context.lineWidth = 3 * ratio
  context.beginPath()
  context.moveTo(hole.x, base)
  context.lineTo(hole.x, top)
  context.stroke()

  context.strokeStyle = '#eee9c9'
  context.lineWidth = 1.6 * ratio
  context.beginPath()
  context.moveTo(hole.x, base)
  context.lineTo(hole.x, top)
  context.stroke()

  const flagTop = top + 2 * ratio
  const flagWidth = 25 * ratio
  const flagHeight = 15 * ratio
  context.fillStyle = '#f3f1dc'
  context.strokeStyle = '#87947d'
  context.lineWidth = 0.8 * ratio
  context.fillRect(hole.x, flagTop, flagWidth, flagHeight)
  context.strokeRect(hole.x, flagTop, flagWidth, flagHeight)

  if (brandMark) {
    const markSize = 13 * ratio
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      brandMark,
      hole.x + (flagWidth - markSize) / 2,
      flagTop + (flagHeight - markSize) / 2,
      markSize,
      markSize,
    )
  } else {
    context.fillStyle = '#0b4a2d'
    context.font = `800 ${9 * ratio}px Georgia, 'Times New Roman', serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('P', hole.x + flagWidth / 2, flagTop + flagHeight * 0.52)
  }
  context.restore()
}

export function GreenCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const transformRef = useRef<Transform>()
  const pointers = useRef(new Map<number, Vec2>())
  const pointerStarts = useRef(new Map<number, Vec2>())
  const aimDrag = useRef<AimDrag>()
  const cameraGesture = useRef<CameraGesture>()
  const suppressAimUntilPointersClear = useRef(false)
  const lastTap = useRef<LastTap>()
  const touchHintSeen = useRef(false)
  const touchHintTimer = useRef<ReturnType<typeof setTimeout>>()
  const zoomIndicatorTimer = useRef<ReturnType<typeof setTimeout>>()
  const [brandMark, setBrandMark] = useState<HTMLImageElement>()
  const [resizeTick, setResizeTick] = useState(0)
  const [showTouchHint, setShowTouchHint] = useState(false)
  const [showZoomIndicator, setShowZoomIndicator] = useState(false)
  const [reviewCamera, setReviewCamera] = useState<ReviewCamera>({
    zoom: 1,
    center: { ...props.puzzle.hole },
  })

  useEffect(() => {
    const image = new Image()
    image.decoding = 'async'
    image.src = `${import.meta.env.BASE_URL}flag-mark.svg`
    image.onload = () => setBrandMark(image)
    return () => {
      image.onload = null
    }
  }, [])

  useEffect(() => {
    try {
      touchHintSeen.current = localStorage.getItem(TOUCH_CAMERA_HINT_KEY) === 'seen'
    } catch {
      touchHintSeen.current = false
    }
    return () => {
      if (touchHintTimer.current) clearTimeout(touchHintTimer.current)
      if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => setResizeTick((tick) => tick + 1))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(bounds.width * ratio)
    canvas.height = Math.round(bounds.height * ratio)
    // The approach establishes the puzzle's original ball position. Do not
    // re-anchor it to the player's current position after each putt, or the
    // review screen turns it into an unrelated curved trace across the green.
    const approachPath = alignApproachPathEndpoint(props.approachPath, props.puzzle.ball)
    const activePath = props.animationKind === 'approach' ? approachPath : props.activePath
    const animatedBall = activePath
      ? interpolatedBall(activePath, props.animationTime ?? 0)
      : props.ball
    const longPutt = Math.hypot(
      props.puzzle.hole.x - props.ball.x,
      props.puzzle.hole.y - props.ball.y,
    ) >= CLOSE_CAMERA_DISTANCE_FT
    const autoClosePutt = Boolean(
      props.animationKind === 'putt' &&
      longPutt &&
      props.activePath &&
      puttNeedsCloseUp(props.activePath, props.animationTime ?? 0, props.puzzle.hole),
    )
    // Once a long putt reaches the cup area, cut to one fixed frame based on
    // its starting line. Following the animated ball here continuously changes
    // both scale and center and can feel like a nauseating tracking zoom.
    const cameraBall = autoClosePutt
      ? fixedCloseCameraBall(props.ball, props.puzzle.hole)
      : props.ball
    const transform = transformFor(
      canvas,
      props.puzzle,
      cameraBall,
      !props.revealed,
      autoClosePutt ? [] : props.strokes.length === 0 ? approachPath : [],
      reviewCamera.zoom > 1 ? reviewCamera : undefined,
      autoClosePutt,
    )
    // Ball, cup, and projected ball share one feature scale and one legibility
    // floor. A smaller close-view floor made the cup visibly shrink during the
    // camera cut on mobile; with one floor, zoom can only preserve or enlarge
    // the features while retaining their regulation 1.68:4.25 diameter ratio.
    const minimumBallRadius = 2.5 * ratio
    const featureScale = Math.max(transform.scale, minimumBallRadius / BALL_RADIUS_FT)
    const ballRadius = BALL_RADIUS_FT * featureScale
    const cupRadius = HOLE_RADIUS_FT * featureScale
    const aimMarkerRadius = ballRadius
    transformRef.current = transform
    const greenTopLeft = screen({ x: 0, y: 0 }, transform)
    const greenBottomRight = screen(
      { x: props.puzzle.green.width, y: props.puzzle.green.height },
      transform,
    )

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#345c3b'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#4b8251'
    context.beginPath()
    context.roundRect(
      greenTopLeft.x,
      greenTopLeft.y,
      greenBottomRight.x - greenTopLeft.x,
      greenBottomRight.y - greenTopLeft.y,
      28 * ratio,
    )
    context.fill()

    // Slope-derived drawing belongs strictly behind the end-of-round gate.
    // Pre-reveal rendering must never use heightAt/sampleSurface.
    if (props.revealed) {
      drawContours(context, props.puzzle, transform)
      drawFallLineArrows(context, props.puzzle, transform, ratio)
    }
    drawPath(
      context,
      approachPath,
      transform,
      'rgba(174, 201, 183, .72)',
      2.6 * ratio,
      props.approachTrailUntil,
    )
    for (const path of props.revealPaths) {
      drawPath(context, path, transform, 'rgba(239, 224, 129, .18)', 3 * ratio)
    }
    props.strokes.forEach((stroke, index) => {
      const palette = ['#b9dcff', '#ffc979', '#e7a7ff', '#e6ee8b']
      drawPath(context, stroke.path, transform, palette[index % palette.length], 2.25 * ratio)
    })
    if (props.idealPath) {
      drawPath(context, props.idealPath, transform, '#fff09a', 4.5 * ratio)
    }

    const input = puttInput(
      props.ball,
      props.puzzle.hole,
      props.puzzle.stimp,
      props.aimIndex,
      props.speedIndex,
    )
    if (!props.activePath && !props.revealed && props.animationKind !== 'approach') {
      const start = screen(props.ball, transform)
      // The guide is a deterministic flat-green finish marker. Its endpoint
      // tracks the same half-foot pace increments as the slider.
      const guideLength = Math.max(0, input.distance + input.pastFeet)
      const end = screen(
        {
          x: props.ball.x + input.direction.x * guideLength,
          y: props.ball.y + input.direction.y * guideLength,
        },
        transform,
      )
      context.setLineDash([6 * ratio, 7 * ratio])
      context.beginPath()
      context.moveTo(start.x, start.y)
      context.lineTo(end.x, end.y)
      context.strokeStyle = 'rgba(255,255,255,.7)'
      context.lineWidth = (transform.zoomed ? 1.65 : 1.2) * ratio
      context.stroke()
      context.setLineDash([])
      if (props.aimEnabled) {
        context.fillStyle = 'rgba(255, 244, 166, .92)'
        context.strokeStyle = 'rgba(28, 48, 32, .72)'
        context.lineWidth = 1.4 * ratio
        context.beginPath()
        context.arc(end.x, end.y, aimMarkerRadius, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }
    }

    if (props.activePath && props.animationKind === 'putt') {
      drawPath(
        context,
        props.activePath,
        transform,
        '#ffffff',
        2.5 * ratio,
        props.animationTime,
      )
    }

    const hole = screen(props.puzzle.hole, transform)
    const closeCup = transform.zoomed || (props.revealed && reviewCamera.zoom > 1) || input.distance <= 6
    if (!closeCup) drawFlag(context, hole, ratio, brandMark)

    if (animatedBall && !props.strokes.at(-1)?.holed) {
      const pixel = screen(animatedBall, transform)
      context.shadowColor = 'rgba(0,0,0,.35)'
      context.shadowBlur = 5 * ratio
      context.shadowOffsetY = 2 * ratio
      context.fillStyle = '#fffef5'
      context.beginPath()
      context.arc(pixel.x, pixel.y, ballRadius, 0, Math.PI * 2)
      context.fill()
      context.shadowColor = 'transparent'
    }

    // Keep the actual aperture visible as the ball passes. Previously the
    // oversized ball was painted over the cup, which made nearby misses look
    // as though they had disappeared into it in the full-green camera.
    drawCup(context, hole, cupRadius, ratio)

    // Keep the solution annotation above course features. The solution path
    // itself still passes naturally beneath the cup, but its label must remain
    // readable when the early part of a short makeable line overlaps the hole.
    if (props.idealPath && props.idealLabel) {
      const labelPoint = props.idealPath[Math.min(2, props.idealPath.length - 1)]
      if (labelPoint) {
        const pixel = screen(labelPoint, transform)
        context.font = `700 ${11 * ratio}px Inter, sans-serif`
        const layout = labelLayout(
          canvas.width,
          canvas.height,
          pixel,
          context.measureText(props.idealLabel).width,
          ratio,
        )
        context.fillStyle = 'rgba(8, 25, 15, .9)'
        context.fillRect(layout.left, layout.top, layout.width, layout.height)
        context.save()
        context.beginPath()
        context.rect(layout.left, layout.top, layout.width, layout.height)
        context.clip()
        context.fillStyle = '#fff3ad'
        context.fillText(props.idealLabel, layout.textX, layout.textY)
        context.restore()
      }
    }
  }, [props, resizeTick, reviewCamera, brandMark])

  const pointerPosition = (event: CanvasPositionEvent): Vec2 => {
    const canvas = event.currentTarget
    const bounds = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    }
  }

  const updateAimFromPointer = (pixel: Vec2) => {
    const transform = transformRef.current
    if (!transform) return
    const nextAim = aimIndexFromPoints(
      screen(props.ball, transform),
      screen(props.puzzle.hole, transform),
      pixel,
    )
    if (nextAim !== undefined) props.onAimIndexChange(nextAim)
  }

  const updateRelativeAim = (drag: AimDrag, pixel: Vec2) => {
    const transform = transformRef.current
    if (!transform) return
    const ball = screen(props.ball, transform)
    const hole = screen(props.puzzle.hole, transform)
    const straightX = hole.x - ball.x
    const straightY = hole.y - ball.y
    const straightLength = Math.hypot(straightX, straightY)
    if (straightLength === 0) return
    const deltaX = pixel.x - drag.start.x
    const deltaY = pixel.y - drag.start.y
    const perpendicularPixels =
      (straightX / straightLength) * deltaY - (straightY / straightLength) * deltaX
    props.onAimIndexChange(aimIndexFromDrag(
      drag.startIndex,
      perpendicularPixels,
      4 * drag.pixelRatio,
    ))
  }

  const updateSpeedFromPointer = (drag: AimDrag, pixel: Vec2) => {
    const transform = transformRef.current
    if (!transform) return
    const ball = screen(props.ball, transform)
    let forwardPixels: number
    if (drag.relative) {
      const hole = screen(props.puzzle.hole, transform)
      const straightX = hole.x - ball.x
      const straightY = hole.y - ball.y
      const straightLength = Math.hypot(straightX, straightY)
      if (straightLength === 0) return
      forwardPixels =
        ((straightX / straightLength) * (pixel.x - drag.start.x)) +
        ((straightY / straightLength) * (pixel.y - drag.start.y))
    } else {
      forwardPixels = Math.hypot(pixel.x - ball.x, pixel.y - ball.y) - drag.startRadius
    }
    props.onSpeedIndexChange(speedIndexFromDrag(
      drag.startSpeedIndex,
      forwardPixels,
      8 * drag.pixelRatio,
    ))
  }

  const actualReviewCenter = (): Vec2 => {
    const transform = transformRef.current
    return transform
      ? {
          x: transform.originX + transform.worldWidth / 2,
          y: transform.originY + transform.worldHeight / 2,
        }
      : reviewCamera.center
  }

  const showTouchCameraHint = (pointerType: string) => {
    if (pointerType !== 'touch' || touchHintSeen.current) return
    touchHintSeen.current = true
    try {
      localStorage.setItem(TOUCH_CAMERA_HINT_KEY, 'seen')
    } catch {
      // The hint can still be shown when storage is unavailable.
    }
    setShowTouchHint(true)
    if (touchHintTimer.current) clearTimeout(touchHintTimer.current)
    touchHintTimer.current = setTimeout(() => setShowTouchHint(false), 4200)
  }

  const flashZoomIndicator = () => {
    setShowZoomIndicator(true)
    if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current)
    zoomIndicatorTimer.current = setTimeout(() => setShowZoomIndicator(false), 900)
  }

  const worldAtPixel = (pixel: Vec2, transform: Transform): Vec2 => ({
    x: transform.originX + (pixel.x - transform.offsetX) / transform.scale,
    y: transform.originY + (pixel.y - transform.offsetY) / transform.scale,
  })

  const cameraCenteredAtPixel = (zoom: number, worldFocus: Vec2, pixelFocus: Vec2): ReviewCamera => {
    const canvas = canvasRef.current
    if (!canvas || zoom <= 1) return { zoom: 1, center: { ...props.puzzle.hole } }
    const fringe = props.puzzle.green.fringe + 0.8
    const worldWidth = (props.puzzle.green.width + fringe * 2) / zoom
    const worldHeight = (props.puzzle.green.height + fringe * 2) / zoom
    const scale = Math.min(canvas.width / worldWidth, canvas.height / worldHeight)
    const offsetX = (canvas.width - worldWidth * scale) / 2
    const offsetY = (canvas.height - worldHeight * scale) / 2
    return {
      zoom,
      center: {
        x: worldFocus.x - (pixelFocus.x - offsetX) / scale + worldWidth / 2,
        y: worldFocus.y - (pixelFocus.y - offsetY) / scale + worldHeight / 2,
      },
    }
  }

  const setReviewZoom = (nextZoom: number, worldFocus?: Vec2, pixelFocus?: Vec2) => {
    const zoom = Math.max(1, Math.min(MAX_CAMERA_ZOOM, nextZoom))
    if (worldFocus && pixelFocus) {
      setReviewCamera(cameraCenteredAtPixel(zoom, worldFocus, pixelFocus))
    } else {
      setReviewCamera((camera) => ({
        zoom,
        center: zoom === 1 ? { ...props.puzzle.hole } : worldFocus ?? actualReviewCenter() ?? camera.center,
      }))
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const transform = transformRef.current
    const pixel = pointerPosition(event)
    const focus = transform ? worldAtPixel(pixel, transform) : props.puzzle.hole
    setReviewZoom(reviewCamera.zoom * (event.deltaY < 0 ? 1.22 : 1 / 1.22), focus, pixel)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    showTouchCameraHint(event.pointerType)
    const pixel = pointerPosition(event)
    pointers.current.set(event.pointerId, pixel)
    pointerStarts.current.set(event.pointerId, pixel)

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const transform = transformRef.current
      if (!transform) return
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const fringe = props.puzzle.green.fringe + 0.8
      const fullWidth = props.puzzle.green.width + fringe * 2
      const fullHeight = props.puzzle.green.height + fringe * 2
      cameraGesture.current = {
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
        startZoom: Math.max(
          1,
          Math.min(MAX_CAMERA_ZOOM, fullWidth / transform.worldWidth, fullHeight / transform.worldHeight),
        ),
        worldFocus: worldAtPixel(midpoint, transform),
      }
      aimDrag.current = undefined
      suppressAimUntilPointersClear.current = true
      lastTap.current = undefined
      return
    }

    if (!props.revealed && props.aimEnabled && !suppressAimUntilPointersClear.current) {
      const bounds = event.currentTarget.getBoundingClientRect()
      const pixelRatio = event.currentTarget.width / bounds.width
      const transform = transformRef.current
      const ballPixel = transform ? screen(props.ball, transform) : undefined
      const relative = Boolean(ballPixel && Math.hypot(
        pixel.x - ballPixel.x,
        pixel.y - ballPixel.y,
      ) <= 96 * pixelRatio)
      aimDrag.current = {
        pointerId: event.pointerId,
        start: pixel,
        startIndex: props.aimIndex,
        startSpeedIndex: props.speedIndex,
        startRadius: ballPixel ? Math.hypot(pixel.x - ballPixel.x, pixel.y - ballPixel.y) : 0,
        pixelRatio,
        relative,
      }
      if (!relative) updateAimFromPointer(pixel)
      return
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const previous = pointers.current.get(event.pointerId) as Vec2
    const current = pointerPosition(event)
    pointers.current.set(event.pointerId, current)

    const gesture = cameraGesture.current
    if (gesture && pointers.current.size >= 2) {
      event.preventDefault()
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const zoom = Math.max(
        1,
        Math.min(MAX_CAMERA_ZOOM, gesture.startZoom * (distance / Math.max(1, gesture.startDistance))),
      )
      setReviewCamera(cameraCenteredAtPixel(zoom, gesture.worldFocus, midpoint))
      flashZoomIndicator()
      return
    }

    const drag = aimDrag.current
    if (drag?.pointerId === event.pointerId && props.aimEnabled) {
      event.preventDefault()
      if (drag.relative) updateRelativeAim(drag, current)
      else updateAimFromPointer(current)
      updateSpeedFromPointer(drag, current)
      return
    }
    if (!props.revealed || suppressAimUntilPointersClear.current) return
    const transform = transformRef.current
    if (!transform) return

    if (pointers.current.size === 1 && reviewCamera.zoom > 1) {
      const center = actualReviewCenter()
      setReviewCamera((camera) => ({
        ...camera,
        center: {
          x: center.x - (current.x - previous.x) / transform.scale,
          y: center.y - (current.y - previous.y) / transform.scale,
        },
      }))
    }
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = aimDrag.current?.pointerId === event.pointerId ? aimDrag.current : undefined
    const end = pointerPosition(event)
    const start = pointerStarts.current.get(event.pointerId)
    const wasCameraGesture = Boolean(cameraGesture.current || suppressAimUntilPointersClear.current)
    if (
      event.type === 'pointerup' &&
      event.pointerType === 'touch' &&
      reviewCamera.zoom > 1 &&
      !wasCameraGesture &&
      start &&
      Math.hypot(end.x - start.x, end.y - start.y) <= 12 * (drag?.pixelRatio ?? 1)
    ) {
      const now = performance.now()
      const previousTap = lastTap.current
      if (
        previousTap &&
        now - previousTap.time <= 340 &&
        Math.hypot(end.x - previousTap.position.x, end.y - previousTap.position.y) <= 32 * (drag?.pixelRatio ?? 1)
      ) {
        if (previousTap.aimIndex !== undefined) props.onAimIndexChange(previousTap.aimIndex)
        if (previousTap.speedIndex !== undefined) props.onSpeedIndexChange(previousTap.speedIndex)
        setReviewZoom(1)
        flashZoomIndicator()
        lastTap.current = undefined
      } else {
        lastTap.current = {
          time: now,
          position: end,
          aimIndex: drag?.startIndex,
          speedIndex: drag?.startSpeedIndex,
        }
      }
    } else if (!wasCameraGesture) {
      lastTap.current = undefined
    }
    if (drag) aimDrag.current = undefined
    pointers.current.delete(event.pointerId)
    pointerStarts.current.delete(event.pointerId)
    if (pointers.current.size < 2) cameraGesture.current = undefined
    if (pointers.current.size === 0) suppressAimUntilPointersClear.current = false
  }

  const showingPuttCloseUp = Boolean(
    props.animationKind === 'putt' &&
    Math.hypot(
      props.puzzle.hole.x - props.ball.x,
      props.puzzle.hole.y - props.ball.y,
    ) >= CLOSE_CAMERA_DISTANCE_FT &&
    props.activePath &&
    puttNeedsCloseUp(props.activePath, props.animationTime ?? 0, props.puzzle.hole),
  )

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`green-canvas ${props.revealed ? 'reviewing' : props.aimEnabled ? 'aiming' : ''}`}
        aria-label={props.aimEnabled ? 'Putting green. Drag with one finger to aim and set pace. Use two fingers to move and zoom.' : 'Putting green. Use two fingers to move and zoom.'}
        data-solution-visible={Boolean(props.idealPath)}
        data-camera-zoom={reviewCamera.zoom.toFixed(3)}
        data-camera-center-x={reviewCamera.center.x.toFixed(3)}
        data-camera-center-y={reviewCamera.center.y.toFixed(3)}
        data-camera-mode={reviewCamera.zoom > 1
          ? 'review'
          : showingPuttCloseUp || usesCloseCamera(props.puzzle, props.ball, !props.revealed)
            ? 'close'
            : 'full'}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
      {showTouchHint && (
        <div className="touch-camera-hint" role="status">One finger adjusts putt <span>&middot;</span> Two fingers move and zoom</div>
      )}
      {showZoomIndicator && (
        <output className="camera-zoom-indicator" aria-label="Camera zoom">{reviewCamera.zoom.toFixed(1)}&times;</output>
      )}
      {props.revealed && (
        <div className="review-controls" aria-label="Green review controls">
          <button type="button" aria-label="Zoom out" disabled={reviewCamera.zoom <= 1} onClick={() => setReviewZoom(reviewCamera.zoom - 0.5)}>−</button>
          <button className="zoom-reset" type="button" onClick={() => setReviewZoom(1)}>{reviewCamera.zoom.toFixed(1)}×</button>
          <button type="button" aria-label="Zoom in" disabled={reviewCamera.zoom >= 4} onClick={() => setReviewZoom(reviewCamera.zoom + 0.5)}>+</button>
        </div>
      )}
    </>
  )
}
