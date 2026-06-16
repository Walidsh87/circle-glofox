import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deskSignUp } from '@/app/dashboard/desk/_actions/desk-sign-up'

beforeEach(() => vi.clearAllMocks())

test('new walk-in: creates member then assigns the plan', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null }, membership_plans: { data: { monthly_price_aed: 0, is_trial: true, trial_days: 7 }, error: null }, memberships: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)

  const res = await deskSignUp({ fullName: 'Sara', email: 'sara@x.com', phone: '+97150', planId: 'trial-1', planName: '7-Day Trial', monthlyPrice: 0 })
  expect(res.error).toBeNull()
  expect(res.memberId).toBe('new1')
  expect(svc.auth.admin.createUser).toHaveBeenCalled()
  expect(svc.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'new1', plan_id: 'trial-1', is_trial: true }))
})

test('rejects bad email before any write', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await deskSignUp({ fullName: 'Sara', email: 'bad', phone: '', planId: 'p1', planName: 'X', monthlyPrice: 0 })
  expect(res.error).toMatch(/valid email/i)
})
