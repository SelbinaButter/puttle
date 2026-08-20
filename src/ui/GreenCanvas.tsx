import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { heightAt, puttInput, type PathPoint, type PuzzleDefinition, type Vec2 } from '../sim'
import type { PlayedStroke } from '../game/types'

interface Props {
  puzzle: PuzzleDefinition
  strokes: PlayedStroke[]
  ball: Vec2
  aimIndex: number
  speedIndex: number
  activePath?: PathPoint[]
  animationTime?: number
  revealPaths: PathPoint[][]
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

  context.strokeStyle = 'rgba(236, 249, 214, .2)'
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

export function GreenCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const transformRef = useRef<Transform>()
  const pointers = useRef(new Map<number, Vec2>())
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
      !props.revealed,
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

    if (props.revealed) drawContours(context, props.puzzle, transform)
    for (const path of props.revealPaths) {
      drawPath(context, path, transform, 'rgba(239, 224, 129, .075)', 3 * ratio)
    }
    props.strokes.forEach((stroke, index) => {
      const palette = ['#b9dcff', '#ffc979', '#e7a7ff', '#e6ee8b']
      drawPath(context, stroke.path, transform, palette[index % palette.length], 2.25 * ratio)
    })

    const input = puttInput(
      props.ball,
      props.puzzle.hole,
      props.puzzle.stimp,
      props.aimIndex,
      props.speedIndex,
    )
    if (!props.activePath && !props.revealed) {
      const start = screen(props.ball, transform)
      const guideLength = Math.min(
        12,
        Math.max(input.distance + 1.5, (120 * ratio) / transform.scale),
      )
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
    }

    if (props.activePath) {
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
    context.fillStyle = '#142019'
    context.beginPath()
    context.arc(hole.x, hole.y, Math.max(4 * ratio, transform.scale * 0.177), 0, Math.PI * 2)
    context.fill()
    if (input.distance <= 6) {
      context.strokeStyle = 'rgba(255,255,255,.48)'
      context.lineWidth = 1.2 * ratio
      context.stroke()
    } else {
      context.strokeStyle = 'rgba(255,255,255,.72)'
      context.lineWidth = ratio
      context.beginPath()
      context.moveTo(hole.x, hole.y)
      context.lineTo(hole.x, hole.y - 28 * ratio)
      context.stroke()
      context.fillStyle = '#f2d46b'
      context.beginPath()
      context.moveTo(hole.x, hole.y - 28 * ratio)
      context.lineTo(hole.x + 18 * ratio, hole.y - 22 * ratio)
      context.lineTo(hole.x, hole.y - 16 * ratio)
      context.closePath()
      context.fill()
    }

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
    if (!props.revealed) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, pointerPosition(event))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      lastPinchDistance.current = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) lastPinchDistance.current = undefined
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`green-canvas ${props.revealed ? 'reviewing' : ''}`}
        aria-label="Putting green"
        data-camera-mode={props.revealed && reviewCamera.zoom > 1
          ? 'review'
          : usesCloseCamera(props.puzzle, props.ball, !props.revealed) ? 'close' : 'full'}
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
