import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addTrainingPlan, setPlanActive, deleteTrainingPlan } from '@/app/dashboard/members/[memberId]/_actions/training-plan'

beforeEach(() => vi.clearAllMocks())

const asRole = (id: string, role: string) =>
  makeSupabaseMock({
    user: { id },
    results: { profiles: { data: { box_id: 'b1', role, full_name: 'C' }, error: null }, member_training_plans: { data: null, error: null } },
  })

test('coach assigns a plan (box-scoped insert, active true, created_by = self)', async () => {
  const rls = asRole('s1', 'coach'); serverCreate.mockResolvedValue(rls)
  const res = await addTrainingPlan('a1', 'Strength block', '5x5 back squat progression')
  expect(res.error).toBeNull()
  expect(rls.builder('member_training_plans').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', created_by: 's1', title: 'Strength block', active: true }),
  )
})

test('empty title rejected before DB', async () => {
  const rls = asRole('s1', 'coach'); serverCreate.mockResolvedValue(rls)
  const res = await addTrainingPlan('a1', '   ', 'body')
  expect(res.error).toMatch(/title/i)
  expect(rls.builder('member_training_plans')?.insert).toBeUndefined()
})

test('an athlete cannot assign a training plan', async () => {
  serverCreate.mockResolvedValue(asRole('a1', 'athlete'))
  const res = await addTrainingPlan('a1', 'Self plan', 'body')
  expect(res.error).toMatch(/coach/i)
})

test('a receptionist cannot assign a training plan', async () => {
  serverCreate.mockResolvedValue(asRole('r1', 'receptionist'))
  const res = await addTrainingPlan('a1', 'Plan', 'body')
  expect(res.error).toMatch(/coach/i)
})

test('setPlanActive updates box- AND athlete-scoped', async () => {
  const rls = asRole('s1', 'coach'); serverCreate.mockResolvedValue(rls)
  const res = await setPlanActive('p1', false, 'a1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_training_plans').update).toHaveBeenCalledWith({ active: false })
  expect(rls.builder('member_training_plans').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('member_training_plans').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})

test('deleteTrainingPlan is box- AND athlete-scoped', async () => {
  const rls = asRole('s1', 'coach'); serverCreate.mockResolvedValue(rls)
  const res = await deleteTrainingPlan('p1', 'a1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_training_plans').delete).toHaveBeenCalled()
  expect(rls.builder('member_training_plans').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('member_training_plans').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})
