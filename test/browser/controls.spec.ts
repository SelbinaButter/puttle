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

  await expect(page.getByText('flat-green finish')).toBeVisible()
  await expect(page.getByText('Soft', { exact: true })).toBeVisible()
  await expect(page.getByText('Leave it short', { exact: true })).toHaveCount(0)
})
