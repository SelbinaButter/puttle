import { expect, test } from '@playwright/test'
import { AIM_COUNT, SPEED_COUNT, simulatePutt, type PuzzleDefinition } from '../../src/sim'

test('archive, practice, and close-to-banner result flow work', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play today’s green' }).click()
  await expect(page.getByRole('heading', { name: 'Puttle' })).toBeVisible()

  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('Archived green')).toBeVisible()
  await expect(page.locator('.archive-picker select')).toHaveValue('2026-08-19')
  await expect(page.locator('.game-card')).toBeVisible()

  await page.getByRole('button', { name: 'Practice' }).click()
  await expect(page.getByText(/doesn’t affect your daily streak/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'New random green' })).toBeVisible()

  await page.getByRole('button', { name: 'Today' }).click()
  const date = (await page.locator('footer').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const puzzle = await fetch(`http://127.0.0.1:4173/puzzles/${date}.json`)
    .then((response) => response.json() as Promise<PuzzleDefinition>)
  let solution: { aimIndex: number; speedIndex: number } | undefined
  for (let aimIndex = 0; aimIndex < AIM_COUNT && !solution; aimIndex += 1) {
    for (let speedIndex = 0; speedIndex < SPEED_COUNT; speedIndex += 1) {
      if (simulatePutt(puzzle, puzzle.ball, aimIndex, speedIndex, { recordPath: false }).holed) {
        solution = { aimIndex, speedIndex }
        break
      }
    }
  }
  expect(solution).toBeDefined()
  const aim = page.locator('input[type="range"]').nth(0)
  const speed = page.locator('input[type="range"]').nth(1)
  await aim.focus()
  const aimDirection = (solution?.aimIndex ?? 30) < 30 ? 'ArrowLeft' : 'ArrowRight'
  for (let step = 0; step < Math.abs((solution?.aimIndex ?? 30) - 30); step += 1) {
    await page.keyboard.press(aimDirection)
  }
  await speed.focus()
  const speedDirection = (solution?.speedIndex ?? 3) < 3 ? 'ArrowLeft' : 'ArrowRight'
  for (let step = 0; step < Math.abs((solution?.speedIndex ?? 3) - 3); step += 1) {
    await page.keyboard.press(speedDirection)
  }
  await page.getByRole('button', { name: 'Putt' }).click()

  const result = page.getByRole('dialog', { name: 'Puzzle result' })
  await expect(result).toBeVisible({ timeout: 15_000 })
  await result.getByRole('button', { name: 'View green', exact: true }).click()
  await expect(result).toBeHidden()
  await expect(page.locator('.result-panel')).toContainText('Green revealed')
  const reviewCanvas = page.locator('.green-canvas')
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'full')
  await reviewCanvas.hover()
  await page.mouse.wheel(0, -180)
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'review')
  await page.locator('.zoom-reset').click()
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'full')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'review')
  await page.getByRole('button', { name: '1.5×' }).click()
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'full')
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible()
})

test('a saved fifth miss is a finished X/5 round', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play today’s green' }).click()
  const date = (await page.locator('footer').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const puzzle = await fetch(`http://127.0.0.1:4173/puzzles/${date}.json`)
    .then((response) => response.json() as Promise<PuzzleDefinition>)
  const missedStroke = {
    aimIndex: 30,
    speedIndex: 3,
    start: puzzle.ball,
    final: { x: puzzle.hole.x + 1, y: puzzle.hole.y },
    finalDistance: 1,
    holed: false,
    lipOut: false,
    elapsed: 2,
    path: [],
  }
  await page.evaluate(
    ({ roundDate, strokes }) => {
      localStorage.setItem(`puttle:round:v1:${roundDate}`, JSON.stringify({ date: roundDate, strokes }))
    },
    { roundDate: date, strokes: Array.from({ length: 5 }, () => missedStroke) },
  )
  await page.reload()
  await expect(page.locator('.result-panel')).toContainText('X/5')
  await expect(page.locator('.green-canvas')).toHaveAttribute('data-camera-mode', 'full')
  await expect(page.getByRole('button', { name: 'Putt', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByRole('dialog', { name: 'Puzzle result' })).toContainText('Round complete')
})
