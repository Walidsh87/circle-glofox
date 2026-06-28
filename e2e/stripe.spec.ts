import { test, expect } from '@playwright/test'
import {
  admin, authFile, USERS, GYM, CLASS_NAME, PACKAGE_NAME,
  ATHLETE_SUB_REF, ATHLETE_CUSTOMER_REF,
  stripeSignature, checkoutCompletedEvent, invoicePaidEvent,
} from './setup/fixtures'

// Stripe paths via webhook simulation: we POST a validly-SIGNED event to the real
// /api/webhooks/stripe route (the same signature the Stripe SDK verifies), so the
// real provisioning runs — no Stripe account or flaky hosted checkout needed.
async function postStripeWebhook(request: import('@playwright/test').APIRequestContext, event: unknown) {
  const payload = JSON.stringify(event)
  return request.post('/api/webhooks/stripe', {
    headers: { 'stripe-signature': stripeSignature(payload), 'content-type': 'application/json' },
    data: payload,
  })
}

async function id(table: string, match: Record<string, string>): Promise<string> {
  let q = admin.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data } = await q.single()
  return (data as { id: string }).id
}

test('buying a pack (Stripe webhook) grants a credit and the member books with it', async ({ browser, request }) => {
  const boxId = await id('boxes', { slug: GYM.slug })
  const packAthleteId = await id('profiles', { email: USERS.packAthlete.email })
  const packageId = await id('packages', { box_id: boxId, name: PACKAGE_NAME })

  // Simulate the post-checkout webhook → grants class credits.
  const res = await postStripeWebhook(request, checkoutCompletedEvent({ packageId, athleteId: packAthleteId, amountAed: 500 }))
  expect(res.ok(), `webhook responded ${res.status()}`).toBeTruthy()

  const { data: granted } = await admin.from('package_credits')
    .select('credits_remaining').eq('box_id', boxId).eq('athlete_id', packAthleteId).eq('kind', 'class')
  const before = granted?.[0]?.credits_remaining ?? 0
  expect(before, 'credits granted by the webhook').toBeGreaterThan(0)

  // The member (no membership) books today's class via the real UI using the credit.
  const ctx = await browser.newContext({ storageState: authFile('packAthlete') })
  const page = await ctx.newPage()
  await page.goto('/dashboard/schedule')
  await expect(page.getByText(CLASS_NAME)).toBeVisible()
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await ctx.close()

  // Exactly one credit consumed.
  const { data: after } = await admin.from('package_credits')
    .select('credits_remaining').eq('box_id', boxId).eq('athlete_id', packAthleteId).eq('kind', 'class')
  expect(after?.[0]?.credits_remaining).toBe(before - 1)
})

test('a membership payment (Stripe webhook) issues a VAT invoice shown on the member page', async ({ browser, request }) => {
  const boxId = await id('boxes', { slug: GYM.slug })
  const athleteId = await id('profiles', { email: USERS.athlete.email })

  const { count: before } = await admin.from('invoices')
    .select('id', { count: 'exact', head: true }).eq('box_id', boxId).eq('athlete_id', athleteId)

  const res = await postStripeWebhook(request, invoicePaidEvent({
    subscriptionRef: ATHLETE_SUB_REF, customerRef: ATHLETE_CUSTOMER_REF, amountAed: 300,
  }))
  expect(res.ok(), `webhook responded ${res.status()}`).toBeTruthy()

  const { data: invoices } = await admin.from('invoices')
    .select('invoice_number, total_aed').eq('box_id', boxId).eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  expect((invoices?.length ?? 0), 'an invoice was issued').toBeGreaterThan(before ?? 0)
  const invoiceNumber = invoices![0].invoice_number as string

  // Staff see the issued invoice on the member's detail page (InvoicesCard).
  const ctx = await browser.newContext({ storageState: authFile('owner') })
  const page = await ctx.newPage()
  await page.goto(`/dashboard/members/${athleteId}`)
  await expect(page.getByText(invoiceNumber)).toBeVisible()
  await ctx.close()
})
