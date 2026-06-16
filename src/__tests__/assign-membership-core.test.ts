import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { assignMembershipCore } from '@/lib/memberships'

beforeEach(() => vi.clearAllMocks())

test('free trial plan → end_date, is_trial, paid', async () => {
  const svc = makeSupabaseMock({ results: {
    membership_plans: { data: { monthly_price_aed: 0, is_trial: true, trial_days: 7 }, error: null },
    memberships: { data: null, error: null },
  } })
  const res = await assignMembershipCore(svc as never, { boxId: 'b1', athleteId: 'a1', planName: '7-Day Trial', monthlyPrice: 0, startDate: '2026-06-01', planId: 'trial-1' })
  expect(res.error).toBeNull()
  expect(svc.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({
    is_trial: true, end_date: '2026-06-08', payment_status: 'paid', plan_id: 'trial-1',
  }))
})

test('non-trial plan → unpaid, no end_date', async () => {
  const svc = makeSupabaseMock({ results: { memberships: { data: null, error: null } } })
  const res = await assignMembershipCore(svc as never, { boxId: 'b1', athleteId: 'a1', planName: 'Unlimited', monthlyPrice: 300, startDate: '2026-06-01' })
  expect(res.error).toBeNull()
  const arg = svc.builder('memberships').insert.mock.calls[0][0]
  expect(arg.payment_status).toBe('unpaid')
  expect(arg.is_trial).toBe(false)
  expect('end_date' in arg).toBe(false)
})
