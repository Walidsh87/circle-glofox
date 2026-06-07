import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveLift } from '@/app/dashboard/lifts/_actions/save-lift'

function fd(liftName: string, weightKg: string) {
  const f = new FormData()
  f.set('liftName', liftName)
  f.set('weightKg', weightKg)
  return f
}

function mockWith(prevGrams: number | null) {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      athlete_lifts: { data: prevGrams === null ? null : { one_rm_grams: prevGrams }, error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('flags a PR and returns the delta when the new max beats the previous', async () => {
  const rls = mockWith(140000)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '142.5'))
  expect(res.error).toBeNull()
  expect(res.pr).toEqual({ liftName: 'back_squat', newKg: 142.5, prevKg: 140, deltaKg: 2.5 })
  const hist = rls.builder('athlete_lifts_history').insert.mock.calls[0][0]
  expect(hist).toEqual(expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', lift_name: 'back_squat', one_rm_grams: 142500, is_pr: true }))
})

test('no PR when the new value equals the previous', async () => {
  const rls = mockWith(140000)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '140'))
  expect(res.pr).toBeNull()
  expect(rls.builder('athlete_lifts_history').insert.mock.calls[0][0].is_pr).toBe(false)
})

test('no PR when the new value is lower than the previous', async () => {
  const rls = mockWith(140000)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '135'))
  expect(res.pr).toBeNull()
  expect(rls.builder('athlete_lifts_history').insert.mock.calls[0][0].is_pr).toBe(false)
})

test('first-ever entry for a lift is a baseline, not a PR', async () => {
  const rls = mockWith(null)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('deadlift', '100'))
  expect(res.pr).toBeNull()
  expect(rls.builder('athlete_lifts_history').insert.mock.calls[0][0].is_pr).toBe(false)
})

test('validation error returns pr: null and never touches the database', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: {} })
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('', '100'))
  expect(res).toEqual({ error: 'Select a lift and enter a valid weight.', pr: null })
  expect(rls.builder('athlete_lifts')).toBeUndefined()
})

test('surfaces an upsert error and does not celebrate', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      athlete_lifts: { data: { one_rm_grams: 140000 }, error: { message: 'db down' } },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '142.5'))
  expect(res).toEqual({ error: 'db down', pr: null })
})

test('does not claim a PR if the history row (feed/chart source) fails to persist', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      athlete_lifts: { data: { one_rm_grams: 140000 }, error: null },
      athlete_lifts_history: { data: null, error: { message: 'history insert failed' } },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '142.5'))
  expect(res.error).toBeNull() // the 1RM itself still saved
  expect(res.pr).toBeNull()    // but we don't celebrate a PR that won't show up
})
