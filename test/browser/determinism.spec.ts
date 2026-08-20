import { expect, test } from '@playwright/test'
import { runDeterminismHarness, type HarnessInput } from '../../src/sim/harness'
import { TEST_PUZZLE } from '../fixtures/puzzle'

test('Node and Chromium produce bit-identical results from integer controls', async ({ page }) => {
  await page.goto('/')
  const inputs: HarnessInput[] = Array.from({ length: 200 }, (_, index) => ({
    start: {
      x: 7 + (index % 5) * 0.125,
      y: 14 + (index % 9) * 0.125,
    },
    aimIndex: (index * 17) % 61,
    speedIndex: (index * 7) % 24,
  }))
  const expected = runDeterminismHarness(TEST_PUZZLE, inputs)
  const actual = await page.evaluate(
    async ({ puzzle, canonicalInputs }) => {
      // @ts-expect-error Vite serves this source module to the browser harness.
      const harness = await import('/src/sim/harness.ts')
      return harness.runDeterminismHarness(puzzle, canonicalInputs)
    },
    { puzzle: TEST_PUZZLE, canonicalInputs: inputs },
  )
  expect(actual).toEqual(expected)
})
