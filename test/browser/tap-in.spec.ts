import { expect, test } from '@playwright/test'
import { localDate } from '../../src/game/date'
import { puzzleFingerprint } from '../../src/game/storage'
import { TEST_PUZZLE } from '../fixtures/puzzle'

test('offers and scores a one-foot tap-in as the final stroke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const puzzle = {
    ...TEST_PUZZLE,
    date: localDate(),
    ball: { x: TEST_PUZZLE.hole.x - 1, y: TEST_PUZZLE.hole.y },
  }
  await page.route(/\/puzzles\/\d{4}-\d{2}-\d{2}\.json$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: puzzle,
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: "Play today's green" }).click()
  await page.evaluate(({ date, fingerprint, puzzle }) => {
    const final = { x: puzzle.hole.x - 0.5, y: puzzle.hole.y }
    localStorage.setItem(`puttle:round:v1:${date}`, JSON.stringify({
      date,
      puzzleFingerprint: fingerprint,
      strokes: [{
        aimIndex: 30,
        speedIndex: 3,
        start: puzzle.ball,
        final,
        finalDistance: 0.5,
        holed: false,
        lipOut: false,
        elapsed: 2,
        path: [],
      }],
    }))
  }, { date: puzzle.date, fingerprint: puzzleFingerprint(puzzle), puzzle })
  await page.reload()

  const tapIn = page.getByRole('button', { name: /Tap in/ })
  await expect(tapIn).toBeVisible()
  await expect(page.getByRole('button', { name: 'Putt', exact: true })).toHaveCount(0)
  await expect(page.locator('.stroke-feedback')).toContainText('Aim and speed are locked. Tap it in.')
  const sliders = page.locator('input[type="range"]')
  await expect(sliders.nth(0)).toBeDisabled()
  await expect(sliders.nth(1)).toBeDisabled()
  await tapIn.click()

  await expect(page.getByRole('dialog', { name: 'Puzzle result' })).toContainText('2/5')
  const savedRound = await page.evaluate(() => {
    const date = document.querySelector('footer')?.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    return date ? localStorage.getItem(`puttle:round:v1:${date}`) : null
  })
  const saved = JSON.parse(savedRound ?? '{}') as { strokes?: Array<{ holed: boolean }> }
  expect(saved.strokes).toHaveLength(2)
  expect(saved.strokes?.[1]?.holed).toBe(true)
})
