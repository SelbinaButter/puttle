import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { heightAt, puttInput, sampleSurface, type PathPoint, type PuzzleDefinition, type Vec2 } from '../sim'
import { aimIndexFromDrag, aimIndexFromPoints, speedIndexFromDrag } from '../game/aim'
import type { PlayedStroke } from '../game/types'

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
  highlightedStrokeIndex?: number
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

function usesCloseCamera(puzzle: PuzzleDefinition, ball: Vec2, allowed: boolean): boolean {
  const dx = puzzle.hole.x - ball.x
  const dy = puzzle.hole.y - ball.y
  return allowed && Math.sqrt(dx * dx + dy * dy) < 10
}

function transformFor(
  canvas: HTMLCanvasElement,
  puzzle: PuzzleDefinition,
  ball: Vec2,
  allowCloseZoom: boolean,
  reviewCamera?: ReviewCamera,
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
  const zoomed = usesCloseCamera(puzzle, ball, allowCloseZoom)
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
    const padding = 3.25
    const centerX = (ball.x + puzzle.hole.x) / 2
    const centerY = (ball.y + puzzle.hole.y) / 2
    worldWidth = Math.max(8, Math.abs(dx) + padding * 2)
    worldHeight = Math.max(8, Math.abs(dy) + padding * 2)
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
  for (const point of path) {
    if (point.t > until) break
    const pixel = screen(point, transform)
    if (!began) {
      context.moveTo(pixel.x, pixel.y)
      began = true
    } else {
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
  close: boolean,
) {
  context.save()
  context.shadowColor = 'rgba(0, 0, 0, .28)'
  context.shadowBlur = (close ? 4 : 2) * ratio
  context.shadowOffsetY = 1.5 * ratio
  context.fillStyle = 'rgba(225, 230, 210, .88)'
  context.beginPath()
  context.arc(center.x, center.y, radius + 1.4 * ratio, 0, Math.PI * 2)
  context.fill()
  context.shadowColor = 'transparent'

  const depth = context.createRadialGradient(
    center.x - radius * 0.28,
    center.y - radius * 0.32,
    radius * 0.08,
    center.x,
    center.y,
    radius,
  )
  depth.addColorStop(0, '#26362c')
  depth.addColorStop(0.48, '#142019')
  depth.addColorStop(1, '#06100a')
  context.fillStyle = depth
  context.beginPath()
  context.arc(center.x, center.y, radius, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = close ? 'rgba(255,255,245,.28)' : 'rgba(255,255,245,.18)'
  context.lineWidth = 0.8 * ratio
  context.beginPath()
  context.arc(center.x, center.y, Math.max(1, radius - 0.6 * ratio), 0, Math.PI * 2)
  context.stroke()
  context.restore()
}

function drawFlag(
  context: CanvasRenderingContext2D,
  hole: Vec2,
  ratio: number,
) {
  const top = hole.y - 31 * ratio
  context.save()
  context.strokeStyle = 'rgba(0,0,0,.2)'
  context.lineWidth = 2.8 * ratio
  context.beginPath()
  context.moveTo(hole.x + 1.4 * ratio, hole.y + 1.2 * ratio)
  context.lineTo(hole.x + 1.4 * ratio, top)
  context.stroke()

  const pole = context.createLinearGradient(hole.x - ratio, 0, hole.x + ratio, 0)
  pole.addColorStop(0, '#dce1d5')
  pole.addColorStop(0.5, '#ffffff')
  pole.addColorStop(1, '#9ea99d')
  context.strokeStyle = pole
  context.lineWidth = 1.6 * ratio
  context.beginPath()
  context.moveTo(hole.x, hole.y)
  context.lineTo(hole.x, top)
  context.stroke()

  const flag = context.createLinearGradient(hole.x, top, hole.x + 19 * ratio, top + 8 * ratio)
  flag.addColorStop(0, '#fff19a')
  flag.addColorStop(0.58, '#e9cf5e')
  flag.addColorStop(1, '#b99a30')
  context.fillStyle = flag
  context.beginPath()
  context.moveTo(hole.x, top + 1.5 * ratio)
  context.bezierCurveTo(
    hole.x + 6 * ratio,
    top - 1.5 * ratio,
    hole.x + 12 * ratio,
    top + 4 * ratio,
    hole.x + 20 * ratio,
    top + 2.5 * ratio,
  )
  context.lineTo(hole.x + 17.5 * ratio, top + 10.5 * ratio)
  context.bezierCurveTo(
    hole.x + 11 * ratio,
    top + 12 * ratio,
    hole.x + 6 * ratio,
    top + 6.5 * ratio,
    hole.x,
    top + 9 * ratio,
  )
  context.closePath()
  context.fill()
  context.strokeStyle = 'rgba(101,77,17,.32)'
  context.lineWidth = 0.7 * ratio
  context.beginPath()
  context.moveTo(hole.x + 8.5 * ratio, top + 1.8 * ratio)
  context.quadraticCurveTo(hole.x + 10 * ratio, top + 6 * ratio, hole.x + 9 * ratio, top + 9 * ratio)
  context.stroke()

  context.fillStyle = '#fff7bf'
  context.beginPath()
  context.arc(hole.x, top, 1.8 * ratio, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

export function GreenCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const transformRef = useRef<Transform>()
  const pointers = useRef(new Map<number, Vec2>())
  const aimDrag = useRef<AimDrag>()
  const lastPinchDistance = useRef<number>()
  const [resizeTick, setResizeTick] = useState(0)
  const [reviewCamera, setReviewCamera] = useState<ReviewCamera>({
    zoom: 1,
    center: { ...props.puzzle.hole },
  })

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
    const transform = transformFor(
      canvas,
      props.puzzle,
      props.ball,
      !props.revealed && props.animationKind !== 'approach',
      props.revealed ? reviewCamera : undefined,
    )
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
      props.approachPath,
      transform,
      'rgba(174, 201, 183, .72)',
      2.6 * ratio,
      props.approachTrailUntil,
    )
    for (const path of props.revealPaths) {
      drawPath(context, path, transform, 'rgba(239, 224, 129, .18)', 3 * ratio)
    }
    const palette = ['#b9dcff', '#ffc979', '#e7a7ff', '#e6ee8b']
    props.strokes.forEach((stroke, index) => {
      if (index === props.highlightedStrokeIndex) return
      drawPath(context, stroke.path, transform, palette[index % palette.length], 2.25 * ratio)
    })
    const highlightedStrokeIndex = props.highlightedStrokeIndex
    const highlightedStroke = highlightedStrokeIndex === undefined
      ? undefined
      : props.strokes[highlightedStrokeIndex]
    if (highlightedStroke && highlightedStrokeIndex !== undefined) {
      drawPath(
        context,
        highlightedStroke.path,
        transform,
        palette[highlightedStrokeIndex % palette.length],
        4 * ratio,
      )
    }
    if (props.idealPath) {
      drawPath(context, props.idealPath, transform, '#fff09a', 4.5 * ratio)
      const labelPoint = props.idealPath[Math.min(2, props.idealPath.length - 1)]
      if (labelPoint && props.idealLabel) {
        const pixel = screen(labelPoint, transform)
        context.font = `700 ${11 * ratio}px Inter, sans-serif`
        context.fillStyle = 'rgba(8, 25, 15, .9)'
        const width = context.measureText(props.idealLabel).width + 14 * ratio
        context.fillRect(pixel.x + 8 * ratio, pixel.y - 20 * ratio, width, 18 * ratio)
        context.fillStyle = '#fff3ad'
        context.fillText(props.idealLabel, pixel.x + 15 * ratio, pixel.y - 7 * ratio)
      }
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
        context.arc(end.x, end.y, 5.5 * ratio, 0, Math.PI * 2)
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
    const closeCup = input.distance <= 6
    drawCup(
      context,
      hole,
      Math.max(4 * ratio, transform.scale * 0.177),
      ratio,
      closeCup,
    )
    if (!closeCup) drawFlag(context, hole, ratio)

    const animatedBall = props.activePath
      ? interpolatedBall(props.activePath, props.animationTime ?? 0)
      : props.ball
    if (animatedBall && !props.strokes.at(-1)?.holed) {
      const pixel = screen(animatedBall, transform)
      context.shadowColor = 'rgba(0,0,0,.35)'
      context.shadowBlur = 5 * ratio
      context.shadowOffsetY = 2 * ratio
      context.fillStyle = '#fffef5'
      context.beginPath()
      context.arc(pixel.x, pixel.y, 6.5 * ratio, 0, Math.PI * 2)
      context.fill()
      context.shadowColor = 'transparent'
    }
  }, [props, resizeTick, reviewCamera])

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

  const setReviewZoom = (nextZoom: number, focus?: Vec2) => {
    const zoom = Math.max(1, Math.min(4, nextZoom))
    setReviewCamera((camera) => ({
      zoom,
      center: zoom === 1 ? { ...props.puzzle.hole } : focus ?? actualReviewCenter() ?? camera.center,
    }))
  }

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!props.revealed) return
    event.preventDefault()
    const transform = transformRef.current
    const pixel = pointerPosition(event)
    const focus = transform
      ? {
          x: transform.originX + (pixel.x - transform.offsetX) / transform.scale,
          y: transform.originY + (pixel.y - transform.offsetY) / transform.scale,
        }
      : props.puzzle.hole
    setReviewZoom(reviewCamera.zoom * (event.deltaY < 0 ? 1.22 : 1 / 1.22), focus)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!props.revealed && props.aimEnabled) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const pixel = pointerPosition(event)
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
    if (!props.revealed) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, pointerPosition(event))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      lastPinchDistance.current = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = aimDrag.current
    if (drag?.pointerId === event.pointerId && props.aimEnabled) {
      event.preventDefault()
      const pixel = pointerPosition(event)
      if (drag.relative) updateRelativeAim(drag, pixel)
      else updateAimFromPointer(pixel)
      updateSpeedFromPointer(drag, pixel)
      return
    }
    if (!props.revealed || !pointers.current.has(event.pointerId)) return
    const previous = pointers.current.get(event.pointerId) as Vec2
    const current = pointerPosition(event)
    pointers.current.set(event.pointerId, current)
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
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
      if (lastPinchDistance.current && lastPinchDistance.current > 0) {
        setReviewZoom(reviewCamera.zoom * (distance / lastPinchDistance.current))
      }
      lastPinchDistance.current = distance
    }
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (aimDrag.current?.pointerId === event.pointerId) aimDrag.current = undefined
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) lastPinchDistance.current = undefined
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`green-canvas ${props.revealed ? 'reviewing' : props.aimEnabled ? 'aiming' : ''}`}
        aria-label={props.aimEnabled ? 'Putting green. Drag sideways to aim and forward or back to set pace.' : 'Putting green'}
        data-camera-mode={props.revealed && reviewCamera.zoom > 1
          ? 'review'
          : usesCloseCamera(props.puzzle, props.ball, !props.revealed && props.animationKind !== 'approach') ? 'close' : 'full'}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
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
