import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { loadActivePlans } from '@/app/dashboard/desk/_actions/load-active-plans'

beforeEach(() => vi.clearAllMocks())

test('returns active plans for the staff members box', async () => {
  const plans = [
    { id: 'p1', name: 'Monthly', monthly_price_aed: 350, provider_plan_ref: null, is_trial: false },
    { id: 'p2', name: 'Trial', monthly_price_aed: 0, provider_plan_ref: null, is_trial: true },
  ]
  const rls = makeSupabaseMock({
    user: { id: 'r1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'receptionist', full_name: 'Receptionist' }, error: null },
      membership_plans: { data: plans, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)

  const res = await loadActivePlans()
  expect(res.error).toBeNull()
  expect(res.plans).toHaveLength(2)
  expect(res.plans?.[0].name).toBe('Monthly')
  expect(rls.builder('membership_plans').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('membership_plans').eq).toHaveBeenCalledWith('active', true)
})

test('returns error when not authenticated', async () => {
  const rls = makeSupabaseMock({ user: null })
  serverCreate.mockResolvedValue(rls)

  const res = await loadActivePlans()
  expect(res.error).toBeTruthy()
  expect(res.plans).toBeUndefined()
})

test('returns error when non-staff role', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'athlete', full_name: 'Athlete' }, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)

  const res = await loadActivePlans()
  expect(res.error).toBeTruthy()
  expect(res.plans).toBeUndefined()
})

test('returns error on db failure', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'r1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'receptionist', full_name: 'Receptionist' }, error: null },
      membership_plans: { data: null, error: { message: 'db error' } },
    },
  })
  serverCreate.mockResolvedValue(rls)

  const res = await loadActivePlans()
  expect(res.error).toMatch(/something went wrong/i) // sanitized, not the raw DB message
  expect(res.plans).toBeUndefined()
})
