import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

// vi.hoisted so the mock factories can reference these (vitest hoists vi.mock above imports).
const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
// next/cache is pulled in transitively by some webhook imports; mock it to a no-op.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// A plain package one-shot purchase (storefront / sell-package): packageId + athleteId +
// paymentRef set, NO quoteId/membershipId → routes to grantPackageCredits.
function packageEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'checkout_completed', rawId: 'evt_pkg_1', sessionId: 'cs_pkg_1',
      subscriptionRef: null, customerRef: null, membershipId: null,
      packageId: 'pkg-1', athleteId: 'ath-1', quoteId: null,
      paymentRef: 'pi_pkg_1', amountAed: 525,
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

// Service-client query order in grantPackageCredits (happy path):
//   1. payment_events.insert          (claimEvent dedup gate)
//   2. package_credits .select.maybeSingle()  (provider_charge_ref dedup pre-check)
//   3. packages.select.single()       (lookup name/type/credit_count/price/expiry)
//   4. profiles.select.single()       (athlete name/email for the invoice)
//   5. issueInvoice → invoices.maybeSingle (dedup) → boxes.single → rpc → invoices.insert.single
//   6. package_credits.insert         (the grant; 23505 = success, other error = 500)
// package_credits is hit TWICE — array entries are consumed in order (dedup, then insert).
function baseResults(overrides: Record<string, unknown> = {}) {
  return {
    payment_events: { data: null, error: null },
    packages: { data: { name: 'PT Block', type: 'pt_block', credit_count: 10, price_aed: 525, expiry_days: null }, error: null },
    profiles: { data: { full_name: 'Sara', email: 'sara@x.com' }, error: null },
    // issueInvoice queries invoices TWICE: (1) dedup .maybeSingle() → none, (2) insert .single() → the id.
    invoices: [{ data: null, error: null }, { data: { id: 'inv-1' }, error: null }],
    boxes: { data: { slug: 'functional-fitness', trn: null, vat_rate: 5, legal_name: 'FF', billing_address: null, name: 'Functional Fitness' }, error: null },
    ...overrides,
  }
}

describe('stripe webhook — package credit grant', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  it('grants exactly one credit batch with credits_total === credits_remaining === pkg.credit_count on first delivery', async () => {
    findProvider.mockResolvedValue(packageEvent())
    const svc = makeSupabaseMock({
      results: baseResults({
        // [0] dedup pre-check → no existing batch; [1] insert → success.
        package_credits: [{ data: null, error: null }, { data: null, error: null }],
      }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    const insert = svc.builder('package_credits').insert
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      box_id: 'box-1',
      athlete_id: 'ath-1',
      package_id: 'pkg-1',
      kind: 'pt_session',
      credits_total: 10,
      credits_remaining: 10,
      provider_charge_ref: 'pi_pkg_1',
    }))
  })

  it('is idempotent on redelivery — provider_charge_ref pre-check finds the batch, no second insert', async () => {
    findProvider.mockResolvedValue(packageEvent())
    const svc = makeSupabaseMock({
      results: baseResults({
        // dedup pre-check returns an existing batch → handler returns before inserting.
        package_credits: { data: { id: 'pc-existing' }, error: null },
      }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true)
    expect(svc.builder('package_credits').insert).not.toHaveBeenCalled()
    // It short-circuits before issuing the invoice too.
    expect(svc.builder('invoices')?.insert).toBeUndefined()
  })

  it('treats a 23505 on insert (concurrent-grant race) as SUCCESS — 200, not a retry signal', async () => {
    findProvider.mockResolvedValue(packageEvent())
    const svc = makeSupabaseMock({
      results: baseResults({
        // [0] dedup pre-check → none; [1] insert → unique violation (already granted concurrently).
        package_credits: [{ data: null, error: null }, { data: null, error: { code: '23505', message: 'duplicate key' } }],
      }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('package_credits').insert).toHaveBeenCalledTimes(1)
  })

  it('returns 500 on a non-23505 insert error so Stripe retries and the paid member is not left without credits', async () => {
    findProvider.mockResolvedValue(packageEvent())
    const svc = makeSupabaseMock({
      results: baseResults({
        // [0] dedup pre-check → none; [1] insert → a real DB error (not unique-violation).
        package_credits: [{ data: null, error: null }, { data: null, error: { code: '23503', message: 'fk violation' } }],
      }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(500)
    expect(svc.builder('package_credits').insert).toHaveBeenCalledTimes(1)
  })
})
