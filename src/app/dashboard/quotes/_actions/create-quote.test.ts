import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireStaffAction: () => guard() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createQuote } from './create-quote'

const LINE = { kind: 'package' as const, packageId: 'p1', label: 'PT block', quantity: 1, unitAmountAed: 525 }

describe('createQuote', () => {
  beforeEach(() => guard.mockReset())

  it('rejects a draft that fails validation', async () => {
    const svc = makeSupabaseMock({ results: { boxes: { data: { vat_rate: 5 }, error: null } } })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({ buyer: { athleteId: 'a1' }, title: '', terms: '', validUntil: null, lines: [LINE] })
    expect(res.error).toMatch(/title/i)
    expect(res.quoteId).toBeNull()
  })

  it('creates a lead for a new prospect, then the quote + lines', async () => {
    const svc = makeSupabaseMock({
      results: {
        boxes: { data: { vat_rate: 5 }, error: null },
        leads: { data: { id: 'lead-9' }, error: null },
        quotes: { data: { id: 'quote-9' }, error: null },
        quote_line_items: { data: null, error: null },
      },
    })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({
      buyer: { newName: 'Sara', newEmail: 'sara@x.com' },
      title: 'PT Bundle', terms: 'Terms here', validUntil: null, lines: [LINE],
    })
    expect(res).toEqual({ error: null, quoteId: 'quote-9' })
    expect(svc.builder('leads').insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'sales', email: 'sara@x.com' }))
    expect(svc.builder('quotes').insert).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: 'lead-9', total_aed: 525, subtotal_aed: 500, vat_aed: 25, created_by: 'u1',
    }))
    expect(svc.builder('quote_line_items').insert).toHaveBeenCalled()
  })
})

describe('createQuote — subscription', () => {
  beforeEach(() => guard.mockReset())

  it('rejects a trial/inactive/price-less plan', async () => {
    const svc = makeSupabaseMock({
      results: {
        boxes: { data: { vat_rate: 5 }, error: null },
        membership_plans: { data: { id: 'plan-1', name: 'Trial', monthly_price_aed: 0, provider_plan_ref: null, is_trial: true, active: true }, error: null },
      },
    })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({ buyer: { athleteId: 'a1' }, title: '', terms: '', validUntil: null, lines: [], mode: 'subscription', planId: 'plan-1' })
    expect(res.error).toMatch(/active paid/i)
    expect(res.quoteId).toBeNull()
  })

  it('creates a subscription quote with plan totals and no line items', async () => {
    const svc = makeSupabaseMock({
      results: {
        boxes: { data: { vat_rate: 5 }, error: null },
        membership_plans: { data: { id: 'plan-1', name: 'Unlimited', monthly_price_aed: 315, provider_plan_ref: 'price_1', is_trial: false, active: true }, error: null },
        profiles: { data: { full_name: 'Sara', email: 'sara@x.com' }, error: null },
        quotes: { data: { id: 'quote-7' }, error: null },
      },
    })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({ buyer: { athleteId: 'a1' }, title: '', terms: '', validUntil: null, lines: [], mode: 'subscription', planId: 'plan-1' })
    expect(res).toEqual({ error: null, quoteId: 'quote-7' })
    expect(svc.builder('quotes').insert).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription', plan_id: 'plan-1', title: 'Unlimited', total_aed: 315, subtotal_aed: 300, vat_aed: 15,
    }))
    expect(svc.builder('quote_line_items')).toBeUndefined()
  })
})
