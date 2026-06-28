import { test, expect } from '@playwright/test'
import { authFile, USERS, CLASS_NAME } from './setup/fixtures'

// Core critical path (no Stripe): an athlete with a paid membership books today's
// class, and a staff member checks them in on the whiteboard. Exercises the real
// auth session, booking entitlement gate, RLS-scoped writes, and the whiteboard.
test('athlete books a class and staff checks them in', async ({ browser }) => {
  // ── Athlete books ──
  const athleteCtx = await browser.newContext({ storageState: authFile('athlete') })
  const athletePage = await athleteCtx.newPage()
  await athletePage.goto('/dashboard/schedule')

  await expect(athletePage.getByText(CLASS_NAME)).toBeVisible()
  await athletePage.getByRole('button', { name: 'Book', exact: true }).click()
  // The same button flips to "Cancel" once booked.
  await expect(athletePage.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await athleteCtx.close()

  // ── Staff checks the athlete in ──
  const staffCtx = await browser.newContext({ storageState: authFile('owner') })
  const staffPage = await staffCtx.newPage()
  await staffPage.goto('/dashboard/whiteboard')

  // The booked athlete appears as a check-in button labelled with their name.
  const memberButton = staffPage.getByRole('button', { name: USERS.athlete.name })
  await expect(memberButton).toBeVisible()
  await memberButton.click()
  // Paid membership → checks in directly; the button gains a ✓.
  await expect(memberButton).toContainText('✓')
  await staffCtx.close()
})
