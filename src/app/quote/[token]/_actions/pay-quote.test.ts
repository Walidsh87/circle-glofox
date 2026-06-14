import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { serviceCreate, getProvider, createCheckoutSession, createCustomer } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  getProvider: vi.fn(),
  createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://stripe/sub', sessionId: 'cs_1' }),
  createCustomer: vi.fn().mockResolvedValue({ customerRef: 'cus_1' }),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/psp', () => ({ getProviderForBox: getProvider }))

import { payQuote } from './pay-quote'

beforeEach(() => {
  serviceCreate.mockReset(); getProvider.mockReset()
  createCheckoutSession.mockClear(); createCustomer.mockClear()
  getProvider.mockResolvedValue({ createCustomer, createCheckoutSession })
})

it('subscription quote: converts buyer, creates the membership, opens subscription checkout with quoteId', async () => {
  const svc = makeSupabaseMock({
    results: {
      quotes: { data: { id: 'q1', status: 'accepted', box_id: 'b1', mode: 'subscription', plan_id: 'plan-1', athlete_id: 'ath-1', lead_id: null, membership_id: null, buyer_email: 'sara@x.com', buyer_name: 'Sara', title: 'Unlimited', quote_number: 'QUO-1', total_aed: 315, valid_until: null }, error: null },
      membership_plans: { data: { id: 'plan-1', name: 'Unlimited', monthly_price_aed: 315, provider_plan_ref: 'price_1' }, error: null },
      memberships: [{ data: { id: 'mem-1' }, error: null }, { data: { provider_customer_ref: null }, error: null }],
      profiles: { data: null, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)
  const res = await payQuote('tok')
  expect(res.error).toBeNull()
  expect(res.url).toBe('https://stripe/sub')
  expect(svc.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'ath-1', plan_id: 'plan-1', payment_status: 'unpaid', provider_plan_ref: 'price_1' }))
  expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ membershipId: 'mem-1', quoteId: 'q1', planRef: 'price_1' }))
})
