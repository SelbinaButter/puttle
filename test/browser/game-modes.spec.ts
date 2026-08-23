import { expect, test } from '@playwright/test'
import { localDate, previousDate } from '../../src/game/date'
import { puzzleFingerprint } from '../../src/game/storage'
import { AIM_COUNT, SPEED_COUNT, simulatePutt, type PuzzleDefinition } from '../../src/sim'

test('an archive deep link opens the specified green', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const archiveDate = previousDate(localDate())
  await page.goto(`/?archive=${archiveDate}`)

  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.archive-picker select')).toHaveValue(archiveDate)
  await expect(page.locator('footer')).toHaveText('The slope stays hidden until the round ends.')
  await expect(page).toHaveURL(new RegExp(`archive=${archiveDate}$`))
})

test('archive, practice, and close-to-banner result flow work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const next = new Date()
  next.setDate(next.getDate() + 1)
  const futureDate = localDate(next)
  await page.route('**/puzzles/index.json', async (route) => {
    const response = await route.fetch()
    const index = await response.json() as { dates: string[] }
    await route.fulfill({ response, json: { dates: [...new Set([...index.dates, futureDate])] } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: "Play today's green" }).click()
  await expect(page.getByRole('heading', { name: 'Puttle' })).toBeVisible()
  await expect(page.locator('footer')).toContainText(/Local time \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  await expect(page.locator('footer')).not.toContainText('Local date')
  await expect(page.locator('.footer-local')).toHaveCSS('display', 'inline')
  const today = (await page.locator('footer').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
  expect(today).toBeDefined()

  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('Archived green')).toBeVisible()
  await expect(page.locator('.archive-picker select')).toHaveValue(previousDate(today!))
  await expect(page.locator(`.archive-picker option[value="${futureDate}"]`)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next archived green' })).toBeDisabled()
  await expect(page.locator('.game-card')).toBeVisible()
  await expect(page.locator('footer')).toHaveText('The slope stays hidden until the round ends.')

  await page.getByRole('button', { name: 'Practice' }).click()
  await expect(page.getByText(/doesn't affect your daily streak/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'New random green' })).toBeVisible()
  await expect(page.locator('footer')).toHaveText('The slope stays hidden until the round ends.')

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
  await expect(aim).toBeEnabled()
  await aim.focus()
  const aimDirection = (solution?.aimIndex ?? 30) < 30 ? 'ArrowLeft' : 'ArrowRight'
  for (let step = 0; step < Math.abs((solution?.aimIndex ?? 30) - 30); step += 1) {
    await page.keyboard.press(aimDirection)
  }
  await speed.focus()
  const currentSpeed = Number(await speed.inputValue())
  const speedDirection = (solution?.speedIndex ?? currentSpeed) < currentSpeed ? 'ArrowLeft' : 'ArrowRight'
  for (let step = 0; step < Math.abs((solution?.speedIndex ?? currentSpeed) - currentSpeed); step += 1) {
    await page.keyboard.press(speedDirection)
  }
  await page.getByRole('button', { name: 'Putt' }).click()

  const result = page.getByRole('dialog', { name: 'Puzzle result' })
  await expect(result).toBeVisible({ timeout: 15_000 })
  await expect(result.getByLabel('Stroke recap')).toHaveCount(0)
  await expect(result).toContainText('Review your putts')
  await expect(result).not.toContainText('A makeable line')
  const resultPanel = page.locator('.result-panel')
  await expect(resultPanel).toBeVisible()
  await expect(resultPanel).toHaveAttribute('aria-hidden', 'true')
  await expect(resultPanel.locator('.secondary-button').first()).toHaveText(
    'Show a makeable line',
    { timeout: 15_000 },
  )
  const resultPanelWhileOpen = await resultPanel.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { height: bounds.height, y: bounds.y + window.scrollY }
  })
  await result.getByRole('button', { name: 'View green', exact: true }).click()
  await expect(result).toBeHidden()
  await expect(resultPanel).toContainText('Green revealed')
  await expect(resultPanel).not.toHaveAttribute('aria-hidden', 'true')
  const resultPanelAfterClose = await resultPanel.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { height: bounds.height, y: bounds.y + window.scrollY }
  })
  expect(resultPanelAfterClose.y).toBe(resultPanelWhileOpen.y)
  expect(resultPanelAfterClose.height).toBe(resultPanelWhileOpen.height)
  const reviewCanvas = page.locator('.green-canvas')
  await expect(reviewCanvas).toHaveAttribute('data-solution-visible', 'false')
  const solutionButton = page.getByRole('button', { name: 'Show a makeable line' })
  await expect(solutionButton).toBeEnabled({ timeout: 15_000 })
  await solutionButton.click()
  await expect(reviewCanvas).toHaveAttribute('data-solution-visible', 'true')
  await expect(page.getByRole('button', { name: 'Hide solution line' })).toBeVisible()
  await page.getByRole('button', { name: 'Hide solution line' }).click()
  await expect(reviewCanvas).toHaveAttribute('data-solution-visible', 'false')
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'full')
  await reviewCanvas.hover()
  await page.mouse.wheel(0, -180)
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'review')
  await page.locator('.zoom-reset').click()
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'full')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'review')
  await page.locator('.zoom-reset').click()
  await expect(reviewCanvas).toHaveAttribute('data-camera-mode', 'full')
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Watch approach again' })).toHaveCount(0)
})

test('a saved fifth miss is a finished X/5 round', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: "Play today's green" }).click()
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
    ({ roundDate, fingerprint, strokes }) => {
      localStorage.setItem(
        `puttle:round:v2:${roundDate}`,
        JSON.stringify({ date: roundDate, puzzleFingerprint: fingerprint, strokes }),
      )
    },
    {
      roundDate: date,
      fingerprint: puzzleFingerprint(puzzle),
      strokes: Array.from({ length: 5 }, () => missedStroke),
    },
  )
  await page.reload()
  await expect(page.locator('.result-panel')).toContainText('X/5')
  await expect(page.locator('.green-canvas')).toHaveAttribute('data-camera-mode', 'full')
  await expect(page.getByRole('button', { name: 'Putt', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByRole('dialog', { name: 'Puzzle result' })).toContainText('Round complete')
})

test('an old-generation round is discarded', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: "Play today's green" }).click()
  const date = (await page.locator('footer').innerText()).match(/\d{4}-\d{2}-\d{2}/)?.[0]
  expect(date).toBeDefined()

  await page.evaluate((roundDate) => {
    localStorage.setItem(`puttle:round:v1:${roundDate}`, JSON.stringify({
      date: roundDate,
      strokes: [{
        aimIndex: 30,
        speedIndex: 3,
        start: { x: 1, y: 1 },
        final: { x: 2, y: 2 },
        finalDistance: 0,
        holed: true,
        lipOut: false,
        elapsed: 1,
        path: [],
      }],
    }))
  }, date)
  await page.reload()

  await expect(page.getByText('Putt 1/5')).toBeVisible()
  await expect(page.locator('.result-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Putt', exact: true })).toBeVisible()
  const fresh = await page.evaluate((roundDate) => {
    const value = localStorage.getItem(`puttle:round:v2:${roundDate}`)
    return value ? JSON.parse(value) as { puzzleFingerprint?: string; strokes: unknown[] } : undefined
  }, date)
  expect(fresh?.puzzleFingerprint).toBeTruthy()
  expect(fresh?.strokes).toEqual([])
})
