import { test, expect } from '@playwright/test'

// Phase 1 foundation check: the app boots under Playwright's webServer and
// serves a rendered page (no server crash). Real flows come in later specs.
test('app boots and serves a rendered page', async ({ page }) => {
  const res = await page.goto('/')
  expect(res, 'navigation produced a response').toBeTruthy()
  expect(res!.status(), 'no server error').toBeLessThan(500)
  await expect(page).toHaveTitle(/.+/)
})
