import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { authFile } from './setup/fixtures'

// Automated accessibility gate (audit checklist §2.12 — previously a judgment-only
// item). Scans the key surfaces with axe-core and fails on serious/critical
// violations. Moderate/minor findings stay advisory (logged, not blocking) so the
// gate catches regressions without freezing every cosmetic contrast tweak.
const BLOCKING = ['serious', 'critical']

async function expectNoBlockingViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const advisory = results.violations.filter((v) => !BLOCKING.includes(v.impact ?? ''))
  if (advisory.length > 0) {
    console.log(
      `[a11y advisory] ${page.url()}: ${advisory.map((v) => `${v.id}(${v.impact})×${v.nodes.length}`).join(', ')}`
    )
  }
  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  expect(
    blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target) }))
  ).toEqual([])
}

test('public gym login page has no serious a11y violations', async ({ page }) => {
  await page.goto('/e2e-suite')
  await page.waitForLoadState('networkidle')
  await expectNoBlockingViolations(page)
})

test('athlete schedule has no serious a11y violations', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('athlete') })
  const page = await ctx.newPage()
  await page.goto('/dashboard/schedule')
  await page.waitForLoadState('networkidle')
  await expectNoBlockingViolations(page)
  await ctx.close()
})

test('staff whiteboard has no serious a11y violations', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('owner') })
  const page = await ctx.newPage()
  await page.goto('/dashboard/whiteboard')
  await page.waitForLoadState('networkidle')
  await expectNoBlockingViolations(page)
  await ctx.close()
})

test('owner dashboard home has no serious a11y violations', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('owner') })
  const page = await ctx.newPage()
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expectNoBlockingViolations(page)
  await ctx.close()
})
