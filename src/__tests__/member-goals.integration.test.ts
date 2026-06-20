import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setGoal, setGoalStatus, markGoalDone, deleteGoal } from '@/app/dashboard/members/[memberId]/_actions/goals'

beforeEach(() => vi.clearAllMocks())

const asRole = (id: string, role: string) =>
  makeSupabaseMock({
    user: { id },
    results: { profiles: { data: { box_id: 'b1', role }, error: null }, member_goals: { data: null, error: null } },
  })

test('athlete creates their own goal (box-scoped insert, created_by = self)', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  const res = await setGoal('a1', { goalType: 'lift_1rm', title: 'Back Squat to 150kg', liftName: 'back_squat', targetKg: 150 })
  expect(res.error).toBeNull()
  expect(rls.builder('member_goals').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', created_by: 'a1', goal_type: 'lift_1rm', target_grams: 150000, lift_name: 'back_squat' }),
  )
})

test('programming staff create a goal for a member', async () => {
  const rls = asRole('s1', 'coach'); serverCreate.mockResolvedValue(rls)
  const res = await setGoal('a1', { goalType: 'attendance', title: '12 sessions', targetCount: 12 })
  expect(res.error).toBeNull()
  expect(rls.builder('member_goals').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', created_by: 's1', goal_type: 'attendance', target_count: 12 }),
  )
})

test('invalid input is rejected before any DB write', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  const res = await setGoal('a1', { goalType: 'lift_1rm', title: 'x', liftName: 'moon_lift', targetKg: 100 })
  expect(res.error).toMatch(/lift/i)
  expect(rls.builder('member_goals')?.insert).toBeUndefined()
})

test('a non-self, non-programming staff (receptionist) cannot set a member goal', async () => {
  serverCreate.mockResolvedValue(asRole('r1', 'receptionist'))
  const res = await setGoal('a1', { goalType: 'custom', title: 'Lose 5kg' })
  expect(res.error).toMatch(/coach/i)
})

test('lift goal stores only lift fields (skill/count nulled)', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  await setGoal('a1', { goalType: 'lift_1rm', title: 'Squat', liftName: 'back_squat', targetKg: 140 })
  expect(rls.builder('member_goals').insert).toHaveBeenCalledWith(
    expect.objectContaining({ skill_key: null, target_belt: null, target_count: null }),
  )
})

test('setGoalStatus archives box-scoped', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  const res = await setGoalStatus('g1', 'archived', 'a1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_goals').update).toHaveBeenCalledWith({ status: 'archived' })
  expect(rls.builder('member_goals').eq).toHaveBeenCalledWith('id', 'g1')
  expect(rls.builder('member_goals').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('member_goals').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})

test('markGoalDone sets achieved_at', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  const res = await markGoalDone('g1', true, 'a1')
  expect(res.error).toBeNull()
  const arg = rls.builder('member_goals').update.mock.calls[0][0]
  expect(arg.achieved_at).toBeTruthy()
})

test('markGoalDone clears achieved_at when undone', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  await markGoalDone('g1', false, 'a1')
  expect(rls.builder('member_goals').update).toHaveBeenCalledWith({ achieved_at: null })
})

test('deleteGoal is box-scoped', async () => {
  const rls = asRole('a1', 'athlete'); serverCreate.mockResolvedValue(rls)
  const res = await deleteGoal('g1', 'a1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_goals').delete).toHaveBeenCalled()
  expect(rls.builder('member_goals').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('member_goals').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})
