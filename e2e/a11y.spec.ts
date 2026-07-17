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

// The 2026-07-17 audit found 7 real a11y defects on the redesigned staff pages
// — every one of them on a page this gate did NOT scan (it covered 4 surfaces
// while the redesign touched 7). Scanning the rest is what stops the next
// redesign from re-introducing them.
for (const [label, path] of [
  ['payments', '/dashboard/payments'],
  ['classes', '/dashboard/classes'],
  ['front desk', '/dashboard/desk'],
  ['people directory', '/dashboard/members'],
] as const) {
  test(`owner ${label} has no serious a11y violations`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile('owner') })
    const page = await ctx.newPage()
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expectNoBlockingViolations(page)
    await ctx.close()
  })
}

// The phone bottom bar holds 4 slots; everything else must stay reachable
// through "More" (a staff owner otherwise loses Reports/Retention entirely).
test('mobile overflow menu reaches nav items the bottom bar cannot hold', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('owner'), viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('link', { name: 'Reports' })).toBeHidden()
  await page.getByRole('button', { name: 'More' }).click()
  const reports = page.getByRole('navigation', { name: 'More' }).getByRole('link', { name: 'Reports' })
  await expect(reports).toBeVisible()
  await expectNoBlockingViolations(page)

  await reports.click()
  await expect(page).toHaveURL(/\/dashboard\/reports/)
  await ctx.close()
})
