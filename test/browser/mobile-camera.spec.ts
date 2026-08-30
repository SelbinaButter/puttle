import { expect, test, type CDPSession } from '@playwright/test'

interface TouchPoint {
  x: number
  y: number
  id: number
  radiusX: number
  radiusY: number
  force: number
}

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 402, height: 874 },
})

async function dispatchTouches(
  session: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: TouchPoint[],
) {
  await session.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

function touch(id: number, x: number, y: number): TouchPoint {
  return { id, x, y, radiusX: 2, radiusY: 2, force: 1 }
}

test('two fingers zoom and pan without changing the putt controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('puttle:onboarding:v1', 'seen'))
  await page.goto('/?archive=2026-01-01')
  await expect(page.getByRole('button', { name: 'Putt', exact: true })).toBeEnabled({ timeout: 15_000 })

  const canvas = page.locator('.green-canvas.aiming')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return

  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  const first = touch(1, center.x - 40, center.y)
  const second = touch(2, center.x + 40, center.y)
  const session = await page.context().newCDPSession(page)

  await dispatchTouches(session, 'touchStart', [first])
  await expect(page.getByText('One finger adjusts putt')).toBeVisible()
  await dispatchTouches(session, 'touchStart', [first, second])

  const aimOutput = page.locator('.controls label').first().locator('output')
  const paceSlider = page.locator('.controls input[type="range"]').nth(1)
  const frozenAim = await aimOutput.innerText()
  const frozenPace = await paceSlider.inputValue()

  const pinchedFirst = touch(1, center.x - 70, center.y + 20)
  const pinchedSecond = touch(2, center.x + 110, center.y + 20)
  await dispatchTouches(session, 'touchMove', [pinchedFirst, pinchedSecond])
  await expect(canvas).toHaveAttribute('data-camera-mode', 'review')
  await expect(page.getByLabel('Camera zoom')).toBeVisible()
  expect(Number(await canvas.getAttribute('data-camera-zoom'))).toBeGreaterThan(2)
  await expect(aimOutput).toHaveText(frozenAim)
  await expect(paceSlider).toHaveValue(frozenPace)

  const centerBeforePan = {
    x: Number(await canvas.getAttribute('data-camera-center-x')),
    y: Number(await canvas.getAttribute('data-camera-center-y')),
  }
  const pannedFirst = touch(1, pinchedFirst.x + 30, pinchedFirst.y + 24)
  const pannedSecond = touch(2, pinchedSecond.x + 30, pinchedSecond.y + 24)
  await dispatchTouches(session, 'touchMove', [pannedFirst, pannedSecond])
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-center-x')))
    .not.toBe(centerBeforePan.x)
  expect(Number(await canvas.getAttribute('data-camera-center-y'))).not.toBe(centerBeforePan.y)
  await expect(aimOutput).toHaveText(frozenAim)
  await expect(paceSlider).toHaveValue(frozenPace)

  await dispatchTouches(session, 'touchEnd', [pannedFirst])
  await dispatchTouches(session, 'touchMove', [touch(1, pannedFirst.x + 35, pannedFirst.y)])
  await expect(aimOutput).toHaveText(frozenAim)
  await expect(paceSlider).toHaveValue(frozenPace)
  await dispatchTouches(session, 'touchEnd', [])

  const resetPoint = touch(3, center.x, center.y)
  await dispatchTouches(session, 'touchStart', [resetPoint])
  await dispatchTouches(session, 'touchEnd', [])
  await page.waitForTimeout(60)
  await dispatchTouches(session, 'touchStart', [resetPoint])
  await dispatchTouches(session, 'touchEnd', [])
  await expect(canvas).toHaveAttribute('data-camera-mode', 'full')
  await expect(canvas).toHaveAttribute('data-camera-zoom', '1.000')
})
