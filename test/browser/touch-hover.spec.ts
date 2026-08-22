import { expect, test } from '@playwright/test'
import { puzzleFingerprint } from '../../src/game/storage'
import type { PuzzleDefinition } from '../../src/sim'

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 402, height: 874 },
})

test('end-of-round actions do not retain desktop hover colors on touch devices', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('puttle:onboarding:v1', 'seen'))
  await page.goto('/')

  const date = (await page.locator('footer').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
  expect(date).toBeDefined()
  const puzzle = await request.get(`/puzzles/${date}.json`).then((response) => response.json() as Promise<PuzzleDefinition>)
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
    ({ roundDate, fingerprint, strokes }) => localStorage.setItem(
      `puttle:round:v1:${roundDate}`,
      JSON.stringify({ date: roundDate, puzzleFingerprint: fingerprint, strokes }),
    ),
    {
      roundDate: date,
      fingerprint: puzzleFingerprint(puzzle),
      strokes: Array.from({ length: 5 }, () => missedStroke),
    },
  )
  await page.reload()

  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
  await expect(page.locator('.result-panel .result-nav-action').first()).toBeHidden()
  const resultPanelBounds = await page.locator('.result-panel').boundingBox()
  const shareBounds = await page.getByRole('button', { name: 'Share result' }).boundingBox()
  expect(resultPanelBounds?.height).toBeLessThan(170)
  expect((shareBounds?.y ?? Infinity) + (shareBounds?.height ?? 0)).toBeLessThanOrEqual(874)

  const showSolution = page.getByRole('button', { name: 'Show a makeable line' })
  await expect(showSolution).toBeEnabled({ timeout: 15_000 })
  await showSolution.tap()

  const hideSolution = page.getByRole('button', { name: 'Hide solution line' })
  await expect(hideSolution).toBeVisible()
  const tappedStyles = await hideSolution.evaluate((button) => {
    const style = getComputedStyle(button)
    return { backgroundColor: style.backgroundColor, color: style.color }
  })
  expect(tappedStyles.backgroundColor).not.toBe('rgb(255, 241, 154)')
  expect(tappedStyles.color).toBe('rgb(216, 227, 212)')

  await hideSolution.tap()
  await expect(showSolution).toBeVisible()
  await expect(showSolution).toHaveCSS('color', 'rgb(216, 227, 212)')
})
