import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { changePlan } from '@/app/dashboard/payments/_actions/change-plan'

beforeEach(() => vi.clearAllMocks())

function owner(plan: { data: unknown; error: unknown }) {
  return makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, membership_plans: plan, memberships: { data: null, error: null } },
  })
}

test('updates the membership with the new plan fields; cycle untouched', async () => {
  const rls = owner({ data: { name: 'Premium', monthly_price_aed: 500, provider_plan_ref: 'price_x', is_trial: false }, error: null })
  serverCreate.mockResolvedValue(rls)
  const res = await changePlan('m1', 'plan-2')
  expect(res.error).toBeNull()
  const arg = rls.builder('memberships').update.mock.calls[0][0]
  expect(arg).toEqual({ plan_id: 'plan-2', plan_name: 'Premium', monthly_price_aed: 500, provider_plan_ref: 'price_x' })
  expect(arg).not.toHaveProperty('last_paid_date')
  expect(arg).not.toHaveProperty('payment_status')
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('id', 'm1')
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('rejects a trial target plan', async () => {
  serverCreate.mockResolvedValue(owner({ data: { name: 'T', monthly_price_aed: 0, provider_plan_ref: null, is_trial: true }, error: null }))
  const res = await changePlan('m1', 'trial-1')
  expect(res.error).toMatch(/trial/i)
})

test('rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await changePlan('m1', 'plan-2')
  expect(res.error).toMatch(/owners/i)
})
