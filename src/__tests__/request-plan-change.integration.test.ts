import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requestPlanChange } from '@/app/dashboard/members/[memberId]/_actions/request-plan-change'

beforeEach(() => vi.clearAllMocks())

function athleteServer() {
  return makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { role: 'athlete', box_id: 'b1', full_name: 'Ahmed Ali' }, error: null } } })
}

function svcWith(over: Record<string, unknown> = {}) {
  return makeSupabaseMock({ results: {
    membership_plans: { data: { name: 'Unlimited', is_trial: false }, error: null },
    memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    follow_up_tasks: [
      { data: [], error: null },   // open-tasks dedup read
      { data: null, error: null }, // insert
    ],
    ...over,
  } as never })
}

test('rejects a non-athlete caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { role: 'coach', box_id: 'b1', full_name: 'Coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('Only members can request plan changes.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('errors when the plan is missing or inactive', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  serviceCreate.mockReturnValue(svcWith({ membership_plans: { data: null, error: null } }))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('Plan not found.')
})

test('rejects trial plans', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  serviceCreate.mockReturnValue(svcWith({ membership_plans: { data: { name: 'Trial week', is_trial: true }, error: null } }))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe("That plan isn't available.")
})

test('errors without an active membership', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  serviceCreate.mockReturnValue(svcWith({ memberships: { data: [{ plan_name: 'Basic', end_date: '2020-01-01', start_date: '2019-01-01' }], error: null } }))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('No active membership — ask at the front desk.')
})

test('dedups an existing pending request', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  const svc = svcWith({ follow_up_tasks: [
    { data: [{ title: 'Plan change: Basic → Unlimited' }], error: null },
    { data: null, error: null },
  ] })
  serviceCreate.mockReturnValue(svc)
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('You already have a pending request.')
  expect(svc.builder('follow_up_tasks').insert).not.toHaveBeenCalled()
})

test('inserts the request task linked to the member', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  const svc = svcWith()
  serviceCreate.mockReturnValue(svc)
  const res = await requestPlanChange('pl2')
  expect(res.error).toBeNull()
  expect(svc.builder('follow_up_tasks').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', member_id: 'a1', created_by: 'a1',
    title: 'Plan change: Basic → Unlimited', done: false,
  }))
})
