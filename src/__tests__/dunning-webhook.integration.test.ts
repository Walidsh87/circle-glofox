import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

// vi.hoisted so the mock factories can reference these (vitest hoists vi.mock above imports).
const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
// Keep the dunning email side-effect inert (no Resend network call) — the assertions
// here are about the membership-row updates, not the email body.
vi.mock('@/lib/email', () => ({ sendCardFailedEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function failedEvent(overrides: Partial<{ rawId: string; subscriptionRef: string | null; amountAed: number }> = {}) {
  return {
    boxId: 'box-1',
    event: {
      kind: 'payment_failed',
      rawId: 'evt_fail_1',
      subscriptionRef: 'sub_1',
      amountAed: 200,
      ...overrides,
    },
  }
}

function succeededEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'payment_succeeded',
      rawId: 'evt_ok_1',
      subscriptionRef: 'sub_1',
      customerRef: 'cus_1',
      chargeRef: 'ch_1',
      paymentRef: 'pi_1',
      amountAed: 200,
    },
  }
}

function req() {
  return { text: async () => '{}', headers: new Headers() } as never
}

// The route binds `const service = createServiceClient()` at module load, so we must
// configure serviceCreate BEFORE (re)importing the module each test.
async function loadPost() {
  vi.resetModules()
  return (await import('@/app/api/webhooks/stripe/route')).POST
}

describe('stripe webhook — dunning path', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  // 1. Idempotency: a re-delivered payment_failed whose claimEvent insert hits the
  // UNIQUE violation (23505) is short-circuited — memberships is never touched, so the
  // failed_charge_attempts counter cannot be double-incremented.
  it('idempotency: a duplicate payment_failed is claimed once and does not touch memberships', async () => {
    findProvider.mockResolvedValue(failedEvent())
    const svc = makeSupabaseMock({
      results: { payment_events: { data: null, error: { code: '23505', message: 'dup' } } },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()

    expect(json.duplicate).toBe(true)
    // The whole increment path is short-circuited — memberships is never queried/updated.
    expect(svc.builder('memberships')).toBeUndefined()
  })

  // 2. First delivery: a fresh payment_failed (claim insert ok) updates memberships with
  // the incremented failed_charge_attempts (0 → 1 here).
  it('first delivery: increments failed_charge_attempts on the membership', async () => {
    findProvider.mockResolvedValue(failedEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        // membership read first, then the update(s) resolve from the sticky last entry.
        memberships: [
          { data: { id: 'mem-1', failed_charge_attempts: 0, monthly_price_aed: 200, athlete_id: 'ath-1', profiles: null }, error: null },
          { data: null, error: null },
        ],
        boxes: { data: { name: 'Functional Fitness', max_payment_retries: 3 }, error: null },
      },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('memberships').update).toHaveBeenCalledWith(
      expect.objectContaining({ failed_charge_attempts: 1 }),
    )
  })

  // 3a. Overdue wiring: at failed_charge_attempts = maxRetries - 1 (here 2, max 3), the
  // next failure crosses the threshold → update carries payment_status: 'overdue'.
  it('overdue wiring: marks the membership overdue when attempts reach maxRetries', async () => {
    findProvider.mockResolvedValue(failedEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        memberships: [
          { data: { id: 'mem-1', failed_charge_attempts: 2, monthly_price_aed: 200, athlete_id: 'ath-1', profiles: null }, error: null },
          { data: null, error: null },
        ],
        boxes: { data: { name: 'Functional Fitness', max_payment_retries: 3 }, error: null },
      },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('memberships').update).toHaveBeenCalledWith(
      expect.objectContaining({ failed_charge_attempts: 3, payment_status: 'overdue' }),
    )
  })

  // 3b. Below threshold: the update increments the counter but carries NO payment_status
  // key (the membership is not flipped to overdue yet).
  it('overdue wiring: below threshold the update carries no payment_status key', async () => {
    findProvider.mockResolvedValue(failedEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        memberships: [
          { data: { id: 'mem-1', failed_charge_attempts: 0, monthly_price_aed: 200, athlete_id: 'ath-1', profiles: null }, error: null },
          { data: null, error: null },
        ],
        boxes: { data: { name: 'Functional Fitness', max_payment_retries: 3 }, error: null },
      },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    await POST(req())

    const updateCalls = svc.builder('memberships').update.mock.calls
    const dunningUpdate = updateCalls.find(
      ([arg]: [Record<string, unknown>]) => 'failed_charge_attempts' in arg,
    )?.[0]
    expect(dunningUpdate).toBeDefined()
    expect(dunningUpdate).toEqual(expect.objectContaining({ failed_charge_attempts: 1 }))
    expect(dunningUpdate).not.toHaveProperty('payment_status')
  })

  // 4. Success resets: a payment_succeeded updates the membership with payment_status:'paid'
  // AND the reset fields failed_charge_attempts:0 / last_failed_at:null.
  it('success resets the dunning counter and marks the membership paid', async () => {
    findProvider.mockResolvedValue(succeededEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        memberships: [
          // (1) lookup by subscription ref → the membership
          { data: { id: 'mem-1', athlete_id: 'ath-1', plan_name: 'Unlimited', profiles: { full_name: 'Sara', email: 'sara@x.com' } }, error: null },
          // subsequent update(s) resolve from the sticky last entry
          { data: null, error: null },
        ],
        // issueInvoice: invoices dedup .maybeSingle() (none) then insert .single() (id)
        invoices: [{ data: null, error: null }, { data: { id: 'inv-1' }, error: null }],
        boxes: { data: { slug: 'ff', trn: null, vat_rate: 5, legal_name: 'FF', billing_address: null, name: 'Functional Fitness' }, error: null },
      },
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('memberships').update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'paid', failed_charge_attempts: 0, last_failed_at: null }),
    )
  })
})
