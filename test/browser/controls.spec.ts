import { expect, test } from '@playwright/test'

test('canvas aiming and pace language work together', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: "Play today's green" }).click()

  const canvas = page.locator('.green-canvas.aiming')
  await expect(canvas).toBeVisible()
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const aimOutput = page.locator('.controls label').first().locator('output')
  const paceSlider = page.locator('.controls input[type="range"]').nth(1)
  const startingPace = await paceSlider.inputValue()
  const observed = new Set<string>()
  for (const [xRatio, yRatio] of [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]) {
    await page.mouse.click(bounds.x + bounds.width * xRatio, bounds.y + bounds.height * yRatio)
    observed.add(await aimOutput.innerText())
  }

  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.35, { steps: 4 })
  await page.mouse.up()
  observed.add(await aimOutput.innerText())
  expect(observed.size).toBeGreaterThan(1)
  await expect(paceSlider).not.toHaveValue(startingPace)

  await expect(page.getByText('flat-green finish')).toBeVisible()
  await expect(page.getByText('Soft', { exact: true })).toBeVisible()
  await expect(page.getByText('Leave it short', { exact: true })).toHaveCount(0)
})

test('primary mobile controls fit on an iPhone 16 Pro viewport', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('puttle:onboarding:v1', 'seen'))
  await page.goto('/')

  const puttButton = page.getByRole('button', { name: 'Putt', exact: true })
  await expect(puttButton).toBeVisible()
  const buttonBounds = await puttButton.boundingBox()
  expect(buttonBounds).not.toBeNull()
  expect((buttonBounds?.y ?? Infinity) + (buttonBounds?.height ?? 0)).toBeLessThanOrEqual(874)

  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  const tabsBounds = await page.getByRole('navigation', { name: 'Game mode' }).boundingBox()
  const pickerBounds = await page.getByLabel('Archived green', { exact: true }).boundingBox()
  expect(tabsBounds).not.toBeNull()
  expect(pickerBounds).not.toBeNull()
  expect(Math.abs((tabsBounds?.y ?? 0) - (pickerBounds?.y ?? 0))).toBeLessThan(8)

  await page.getByRole('button', { name: 'Practice', exact: true }).click()
  const practiceButtonBounds = await page.getByRole('button', { name: 'New random green' }).boundingBox()
  const practiceTabsBounds = await page.getByRole('navigation', { name: 'Game mode' }).boundingBox()
  expect(practiceButtonBounds).not.toBeNull()
  expect(practiceTabsBounds).not.toBeNull()
  expect(Math.abs((practiceTabsBounds?.y ?? 0) - (practiceButtonBounds?.y ?? 0))).toBeLessThan(8)

  const firstRead = page.locator('.first-read')
  await expect(firstRead).toBeVisible()
  const firstReadBounds = await firstRead.boundingBox()
  expect(firstReadBounds?.height).toBeLessThan(34)
})

test('mobile tutorial title stays on one line without overflowing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')

  const title = page.getByRole('heading', { name: 'Read it. Roll it. Hole it.' })
  await expect(title).toBeVisible()
  const dimensions = await title.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      lineCount: range.getClientRects().length,
    }
  })
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  expect(dimensions.lineCount).toBe(1)
})
