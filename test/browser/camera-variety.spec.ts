import { expect, test } from '@playwright/test'
import { localDate } from '../../src/game/date'
import { TEST_PUZZLE } from '../fixtures/puzzle'
import type { PuzzleDefinition } from '../../src/sim'

const cases = [
  { name: 'short horizontal', ball: { x: 12, y: 28 }, hole: { x: 30, y: 28 } },
  { name: 'short vertical', ball: { x: 28, y: 12 }, hole: { x: 28, y: 30 } },
  { name: 'showcase diagonal', ball: { x: 12, y: 12 }, hole: { x: 36.5, y: 36.5 } },
] as const

for (const example of cases) {
  test(`north-up full green frames a ${example.name} putt`, async ({ page }) => {
    await page.setViewportSize({ width: example.name.includes('vertical') ? 390 : 900, height: 720 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('puttle:onboarding:v1', 'seen'))
    const puzzle: PuzzleDefinition = {
      ...TEST_PUZZLE,
      date: localDate(),
      green: { ...TEST_PUZZLE.green, width: 56, height: 56 },
      approach: { from: example.ball, velocity: { x: 0, y: 0 } },
      ball: example.ball,
      hole: example.hole,
    }
    await page.route(/\/puzzles\/\d{4}-\d{2}-\d{2}\.json$/, (route) => route.fulfill({
      contentType: 'application/json',
      json: puzzle,
    }))
    await page.goto('/')
    const canvas = page.locator('.green-canvas')
    await expect(canvas).toHaveAttribute('data-camera-mode', 'full')
    const bounds = await canvas.boundingBox()
    expect(bounds?.width).toBeGreaterThan(300)
    expect(bounds?.height).toBeGreaterThanOrEqual(300)
    await expect(page.locator('.readout-distance')).toBeVisible()
  })
}

test('approach and long first-putt setup keep the full green and fringe', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puttle:onboarding:v1', 'seen'))
  await page.goto('/')
  const canvas = page.locator('.green-canvas')
  await expect(canvas).toHaveAttribute('data-camera-mode', 'full')
  await expect(page.getByRole('button', { name: 'Putt', exact: true })).toBeEnabled({ timeout: 15_000 })
  await expect(canvas).toHaveAttribute('data-camera-mode', 'full')
})
