import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createMembershipPlan } from '@/app/dashboard/payments/_actions/create-membership-plan'
import { editMembershipPlan } from '@/app/dashboard/payments/_actions/edit-membership-plan'
import { toggleMembershipPlan } from '@/app/dashboard/payments/_actions/toggle-membership-plan'
import { deleteMembershipPlan } from '@/app/dashboard/payments/_actions/delete-membership-plan'

beforeEach(() => vi.clearAllMocks())

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
function owner(planResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  return makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, membership_plans: planResult },
  })
}
function coach() {
  return makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } })
}

test('createMembershipPlan inserts box-scoped', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await createMembershipPlan({ error: null }, form({ name: 'Unlimited', monthlyPrice: '300', providerPlanRef: 'price_1' }))
  expect(res.error).toBeNull()
  expect(rls.builder('membership_plans').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', name: 'Unlimited', monthly_price_aed: 300, provider_plan_ref: 'price_1' }),
  )
})

test('createMembershipPlan rejects an empty name before any DB call', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await createMembershipPlan({ error: null }, form({ name: '  ', monthlyPrice: '300' }))
  expect(res.error).toMatch(/name/i)
})

test('editMembershipPlan updates scoped by id + box', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await editMembershipPlan('p1', 'Student', 200, null)
  expect(res.error).toBeNull()
  expect(rls.builder('membership_plans').update).toHaveBeenCalledWith({ name: 'Student', monthly_price_aed: 200, provider_plan_ref: null, is_trial: false, trial_days: null })
  expect(rls.builder('membership_plans').eq).toHaveBeenCalledWith('id', 'p1')
  expect(rls.builder('membership_plans').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleMembershipPlan flips active', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await toggleMembershipPlan('p1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('membership_plans').update).toHaveBeenCalledWith({ active: false })
})

test('deleteMembershipPlan maps 23503 to the deactivate message', async () => {
  serverCreate.mockResolvedValue(owner({ data: null, error: { code: '23503', message: 'fk' } }))
  const res = await deleteMembershipPlan('p1')
  expect(res.error).toMatch(/in use.*deactivate/i)
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(coach())
  expect((await createMembershipPlan({ error: null }, form({ name: 'X', monthlyPrice: '1' }))).error).toMatch(/owners/i)
  expect((await toggleMembershipPlan('p1', true)).error).toMatch(/owners/i)
})
