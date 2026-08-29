import { expect, test } from '@playwright/test'
import { localDate } from '../../src/game/date'
import { puzzleFingerprint } from '../../src/game/storage'
import { TEST_PUZZLE } from '../fixtures/puzzle'
import type { PlayedStroke } from '../../src/game/types'

interface CanvasVisualState {
  ballRadius?: number
  cupRadius?: number
  cupCenter?: { x: number; y: number }
  detailedCupLiner?: boolean
  ghostRadius?: number
  solutionLabel?: { x: number; y: number; width: number; height: number }
}

declare global {
  interface Window {
    __canvasVisualState?: CanvasVisualState
  }
}

test.use({
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
})

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('puttle:onboarding:v1', 'seen')
    const state: CanvasVisualState = window.__canvasVisualState = {}
    const prototype = CanvasRenderingContext2D.prototype
    const arc = prototype.arc
    const fill = prototype.fill
    const fillRect = prototype.fillRect
    const stroke = prototype.stroke
    let lastArcRadius: number | undefined
    let lastArcCenter: { x: number; y: number } | undefined

    prototype.arc = function (x, y, radius, startAngle, endAngle, counterclockwise) {
      lastArcRadius = radius
      lastArcCenter = { x, y }
      return arc.call(this, x, y, radius, startAngle, endAngle, counterclockwise)
    }
    prototype.fill = (function (
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) {
      const color = String(this.fillStyle)
      if (color === '#fffef5') state.ballRadius = lastArcRadius
      if (color === '#0b1810') {
        state.cupRadius = lastArcRadius
        state.cupCenter = lastArcCenter
      }
      if (color === 'rgba(255, 244, 166, 0.92)') state.ghostRadius = lastArcRadius
      return Reflect.apply(fill, this, args)
    }) as typeof prototype.fill
    prototype.fillRect = function (x, y, width, height) {
      if (String(this.fillStyle) === 'rgba(8, 25, 15, 0.9)') {
        state.solutionLabel = { x, y, width, height }
      }
      return fillRect.call(this, x, y, width, height)
    }
    prototype.stroke = (function (
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) {
      if (String(this.strokeStyle) === 'rgba(229, 232, 214, 0.82)') {
        state.detailedCupLiner = true
      }
      return Reflect.apply(stroke, this, args)
    }) as typeof prototype.stroke
  })
})

test('full-green ball, cup, and ghost use one legible physical scale', async ({ page }) => {
  const puzzle = { ...TEST_PUZZLE, date: localDate() }
  await page.route(/\/puzzles\/\d{4}-\d{2}-\d{2}\.json$/, (route) => route.fulfill({
    contentType: 'application/json',
    json: puzzle,
  }))
  await page.goto('/')
  const canvas = page.locator('.green-canvas')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'full')
  await canvas.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))

  const state = await page.evaluate(() => window.__canvasVisualState)
  expect((state?.ballRadius ?? 0) / 2).toBeGreaterThanOrEqual(2.4)
  expect(state?.ghostRadius).toBeCloseTo(state?.ballRadius ?? 0, 6)
  expect((state?.cupRadius ?? 0) / (state?.ballRadius ?? Infinity))
    .toBeCloseTo(4.25 / 1.68, 6)
  expect(state?.detailedCupLiner).toBe(true)
})

test('a long putt switches to the close camera near the cup', async ({ page }) => {
  const puzzle = { ...TEST_PUZZLE, date: localDate() }
  await page.route(/\/puzzles\/\d{4}-\d{2}-\d{2}\.json$/, (route) => route.fulfill({
    contentType: 'application/json',
    json: puzzle,
  }))
  await page.goto('/')
  const canvas = page.locator('.green-canvas')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'full')
  const fullCupRadius = await page.evaluate(() => window.__canvasVisualState?.cupRadius)
  await page.getByRole('button', { name: 'Putt', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-mode', 'close', { timeout: 8_000 })
  const initialCup = await page.evaluate(() => ({
    center: window.__canvasVisualState?.cupCenter,
    radius: window.__canvasVisualState?.cupRadius,
  }))
  expect(initialCup.radius).toBeGreaterThanOrEqual(fullCupRadius ?? Infinity)
  await canvas.evaluate(() => new Promise<void>((resolve) => {
    let frames = 0
    const next = () => {
      frames += 1
      if (frames >= 12) resolve()
      else requestAnimationFrame(next)
    }
    requestAnimationFrame(next)
  }))
  const laterCup = await page.evaluate(() => ({
    center: window.__canvasVisualState?.cupCenter,
    radius: window.__canvasVisualState?.cupRadius,
    liner: window.__canvasVisualState?.detailedCupLiner,
  }))
  expect(laterCup.center).toEqual(initialCup.center)
  expect(laterCup.radius).toBe(initialCup.radius)
  expect(laterCup.liner).toBe(true)
})

test('makeable-line label stays inside the mobile canvas', async ({ page }) => {
  const puzzle = { ...TEST_PUZZLE, date: localDate() }
  const missedStroke: PlayedStroke = {
    aimIndex: 30,
    speedIndex: 3,
    start: puzzle.ball,
    final: { x: puzzle.hole.x + 1, y: puzzle.hole.y },
    finalDistance: 1,
    holed: false,
    lipOut: false,
    elapsed: 2,
    path: [
      { ...puzzle.ball, t: 0, speed: 1 },
      { x: puzzle.hole.x + 1, y: puzzle.hole.y, t: 2, speed: 0 },
    ],
  }
  await page.addInitScript(({ date, fingerprint, stroke }) => {
    localStorage.setItem(`puttle:round:v2:${date}`, JSON.stringify({
      date,
      puzzleFingerprint: fingerprint,
      strokes: Array.from({ length: 5 }, () => stroke),
    }))
  }, {
    date: puzzle.date,
    fingerprint: puzzleFingerprint(puzzle),
    stroke: missedStroke,
  })
  await page.route(/\/puzzles\/\d{4}-\d{2}-\d{2}\.json$/, (route) => route.fulfill({
    contentType: 'application/json',
    json: puzzle,
  }))
  await page.goto('/')
  const canvas = page.locator('.green-canvas')
  const solutionButton = page.getByRole('button', { name: 'Show a makeable line' })
  await expect(solutionButton).toBeEnabled({ timeout: 15_000 })
  await solutionButton.click()
  await expect(canvas).toHaveAttribute('data-solution-visible', 'true')

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    return {
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      label: window.__canvasVisualState?.solutionLabel,
    }
  })
  expect(geometry.label).toBeDefined()
  expect(geometry.label?.x).toBeGreaterThanOrEqual(0)
  expect((geometry.label?.x ?? Infinity) + (geometry.label?.width ?? Infinity))
    .toBeLessThanOrEqual(geometry.canvasWidth)
  expect(geometry.label?.y).toBeGreaterThanOrEqual(0)
  expect((geometry.label?.y ?? Infinity) + (geometry.label?.height ?? Infinity))
    .toBeLessThanOrEqual(geometry.canvasHeight)
})
