import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

// vi.hoisted so the mock factories can reference these (vitest hoists vi.mock above imports).
const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
// Avoid pulling real env / next cache into the module-load path.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function req() {
  return { text: async () => '{}', headers: new Headers() } as never
}

// A one-off (non-membership) quote checkout event — routes to handleQuotePayment.
function quoteEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'checkout_completed', rawId: 'evt_q', sessionId: 'cs_q',
      subscriptionRef: null, customerRef: null, membershipId: null,
      packageId: null, athleteId: null, quoteId: 'quote-1',
      paymentRef: 'pi_q', amountAed: 525,
    },
  }
}

// A charge.refunded event. `fullyRefunded` mirrors the provider's signal the route reads.
function refundEvent(fullyRefunded: boolean) {
  return {
    boxId: 'box-1',
    event: {
      kind: 'refunded', rawId: 'evt_r', paymentRef: 'pi_r',
      refundRef: 're_1', amountAed: 100, fullyRefunded, reason: 'requested_by_customer',
    },
  }
}

// The route binds `const service = createServiceClient()` at module load, so we must
// configure serviceCreate BEFORE (re)importing the module each test.
async function loadPost() {
  vi.resetModules()
  return (await import('@/app/api/webhooks/stripe/route')).POST
}

describe('stripe webhook — quote status guards', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  it('does NOT provision when the quote is voided (no invoice insert)', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null }, // claimEvent succeeds → proceed
        quotes: { data: { id: 'quote-1', status: 'voided', title: 'PT Bundle', total_aed: 525, buyer_name: 'Sara', buyer_email: 'sara@x.com', athlete_id: null, lead_id: null }, error: null },
      },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('invoices')).toBeUndefined() // invoices table never touched
    expect(svc.builder('package_credits')).toBeUndefined()
  })

  it('does NOT provision when the quote is declined (no invoice insert)', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        quotes: { data: { id: 'quote-1', status: 'declined', title: 'PT Bundle', total_aed: 525, buyer_name: 'Sara', buyer_email: 'sara@x.com', athlete_id: null, lead_id: null }, error: null },
      },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('invoices')).toBeUndefined()
    expect(svc.builder('package_credits')).toBeUndefined()
  })

  it('replay guard — an already-paid quote does NOT re-provision (duplicate response, no invoice insert)', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        quotes: { data: { id: 'quote-1', status: 'paid', title: 'PT Bundle', total_aed: 525, buyer_name: 'Sara', buyer_email: 'sara@x.com', athlete_id: null, lead_id: null }, error: null },
      },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true) // status==='paid' → duplicate flag
    expect(svc.builder('invoices')).toBeUndefined() // no second invoice
    expect(svc.builder('package_credits')).toBeUndefined()
    // The quote is never re-updated either.
    expect(svc.builder('quotes').update).not.toHaveBeenCalled()
  })
})

describe('stripe webhook — refund dedup + membership flip', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  it('dedup — skips inserting a second credit note when one already exists for the refund ref', async () => {
    findProvider.mockResolvedValue(refundEvent(true))
    const svc = makeSupabaseMock({
      results: {
        invoices: { data: { id: 'inv-1', vat_rate: 5, membership_id: 'mem-1', athlete_id: 'ath-1', invoice_number: 'INV-1', trn_snapshot: null, legal_name_snapshot: 'FF', billing_address_snapshot: null, customer_name_snapshot: 'Sara', customer_email_snapshot: 'sara@x.com' }, error: null },
        // existing-credit-note pre-check returns a row → dedup, bail before insert.
        credit_notes: { data: { id: 'cn-existing' }, error: null },
      },
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    // The pre-check ran...
    expect(svc.builder('credit_notes').select).toHaveBeenCalled()
    // ...but no second credit note was inserted.
    expect(svc.builder('credit_notes').insert).not.toHaveBeenCalled()
    // And the membership is NOT touched on the dedup short-circuit.
    expect(svc.builder('memberships')).toBeUndefined()
  })

  it('FULL refund — inserts the credit note AND flips the membership to unpaid', async () => {
    findProvider.mockResolvedValue(refundEvent(true))
    const svc = makeSupabaseMock({
      results: {
        invoices: { data: { id: 'inv-1', total_aed: 525, vat_rate: 5, membership_id: 'mem-1', athlete_id: 'ath-1', invoice_number: 'INV-1', trn_snapshot: null, legal_name_snapshot: 'FF', billing_address_snapshot: null, customer_name_snapshot: 'Sara', customer_email_snapshot: 'sara@x.com' }, error: null },
        // credit_notes hit in order: existing-check (none) → prior-notes sum (none) → insert.
        credit_notes: [{ data: null, error: null }, { data: [], error: null }, { data: null, error: null }],
        boxes: { data: { slug: 'functional-fitness' }, error: null },
        memberships: { data: null, error: null },
      },
      rpc: { data: 7, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('credit_notes').insert).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_id: 'inv-1', provider_refund_ref: 're_1' }),
    )
    // FULL refund on a membership invoice flips it unpaid.
    expect(svc.builder('memberships').update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'unpaid' }),
    )
  })

  it('PARTIAL refund — inserts the credit note but does NOT flip the membership', async () => {
    findProvider.mockResolvedValue(refundEvent(false))
    const svc = makeSupabaseMock({
      results: {
        invoices: { data: { id: 'inv-1', total_aed: 525, vat_rate: 5, membership_id: 'mem-1', athlete_id: 'ath-1', invoice_number: 'INV-1', trn_snapshot: null, legal_name_snapshot: 'FF', billing_address_snapshot: null, customer_name_snapshot: 'Sara', customer_email_snapshot: 'sara@x.com' }, error: null },
        // credit_notes hit in order: existing-check (none) → prior-notes sum (none) → insert.
        credit_notes: [{ data: null, error: null }, { data: [], error: null }, { data: null, error: null }],
        boxes: { data: { slug: 'functional-fitness' }, error: null },
        memberships: { data: null, error: null },
      },
      rpc: { data: 8, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    // Credit note still issued for the partial amount.
    expect(svc.builder('credit_notes').insert).toHaveBeenCalled()
    // ...but a partial refund must NOT flip the membership.
    expect(svc.builder('memberships')).toBeUndefined()
  })
})

describe('stripe webhook — refund amount cap (sum of credit notes <= invoice total)', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  function refundOf(amountAed: number, refundRef: string) {
    return { boxId: 'box-1', event: { kind: 'refunded', rawId: 'evt_r', paymentRef: 'pi_r', refundRef, amountAed, fullyRefunded: false, reason: 'requested_by_customer' } }
  }

  it('clamps the credit note to the invoice remaining balance (prior notes already cover part)', async () => {
    findProvider.mockResolvedValue(refundOf(50, 're_2')) // would over-credit: 80 prior + 50 = 130 > 100 total
    const svc = makeSupabaseMock({
      results: {
        invoices: { data: { id: 'inv-1', total_aed: 100, vat_rate: 5, membership_id: null, athlete_id: 'ath-1', invoice_number: 'INV-1', trn_snapshot: null, legal_name_snapshot: 'FF', billing_address_snapshot: null, customer_name_snapshot: 'Sara', customer_email_snapshot: 'sara@x.com' }, error: null },
        // existing-check (none) → prior-notes sum (80 already refunded) → insert
        credit_notes: [{ data: null, error: null }, { data: [{ total_aed: 80 }], error: null }, { data: null, error: null }],
        boxes: { data: { slug: 'ff' }, error: null },
      },
      rpc: { data: 2, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    // remaining = 100 - 80 = 20, so the note is clamped to 20 (not the 50 Stripe reported).
    expect(svc.builder('credit_notes').insert).toHaveBeenCalledWith(
      expect.objectContaining({ total_aed: 20 }),
    )
  })

  it('skips inserting a credit note when the invoice is already fully credited', async () => {
    findProvider.mockResolvedValue(refundOf(30, 're_3'))
    const svc = makeSupabaseMock({
      results: {
        invoices: { data: { id: 'inv-1', total_aed: 100, vat_rate: 5, membership_id: null, athlete_id: 'ath-1', invoice_number: 'INV-1', trn_snapshot: null, legal_name_snapshot: 'FF', billing_address_snapshot: null, customer_name_snapshot: 'Sara', customer_email_snapshot: 'sara@x.com' }, error: null },
        // existing-check (none) → prior-notes already sum to the full invoice total
        credit_notes: [{ data: null, error: null }, { data: [{ total_aed: 100 }], error: null }, { data: null, error: null }],
        boxes: { data: { slug: 'ff' }, error: null },
      },
      rpc: { data: 3, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(svc.builder('credit_notes').insert).not.toHaveBeenCalled()
  })
})
