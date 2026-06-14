import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

// vi.hoisted so the mock factories can reference these (vitest hoists vi.mock above imports).
const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))

function quoteEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'checkout_completed', rawId: 'evt_1', sessionId: 'cs_1',
      subscriptionRef: null, customerRef: null, membershipId: null,
      packageId: null, athleteId: null, quoteId: 'quote-1',
      paymentRef: 'pi_1', amountAed: 525,
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

describe('stripe webhook — quote payment', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  it('converts the lead, issues an invoice, grants credits, marks the quote paid', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        quotes: { data: { id: 'quote-1', status: 'accepted', title: 'PT Bundle', total_aed: 525, buyer_name: 'Sara', buyer_email: 'sara@x.com', athlete_id: null, lead_id: 'lead-1' }, error: null },
        leads: { data: { full_name: 'Sara', phone: null, email: 'sara@x.com', referred_by: null, source: 'sales' }, error: null },
        // issueInvoice queries invoices TWICE: (1) dedup .maybeSingle() → none, (2) insert .single() → the id.
        invoices: [{ data: null, error: null }, { data: { id: 'inv-1' }, error: null }],
        boxes: { data: { slug: 'functional-fitness', trn: null, vat_rate: 5, legal_name: 'FF', billing_address: null, name: 'Functional Fitness' }, error: null },
        quote_line_items: { data: [{ id: 'line-1', package_id: 'p1', quantity: 1 }], error: null },
        packages: { data: { type: 'pt_block', credit_count: 10, expiry_days: null }, error: null },
        package_credits: { data: null, error: null },
        profiles: { data: null, error: null },
      },
      rpc: { data: 1, error: null },
    }) as ReturnType<typeof makeSupabaseMock> & { auth: { admin: Record<string, unknown> } }
    svc.auth.admin.createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new-athlete' } }, error: null })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(svc.builder('invoices').insert).toHaveBeenCalled()
    expect(svc.builder('package_credits').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'new-athlete', credits_total: 10 }))
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', athlete_id: 'new-athlete', invoice_id: 'inv-1' }))
  })

  it('is idempotent — a duplicate event is claimed once', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: { payment_events: { data: null, error: { code: '23505', message: 'dup' } } },
    })
    serviceCreate.mockReturnValue(svc)
    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()
    expect(json.duplicate).toBe(true)
  })
})
