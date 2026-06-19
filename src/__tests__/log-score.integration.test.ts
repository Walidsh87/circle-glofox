import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { logScore } from '@/app/dashboard/wod/_actions/log-score'

function fd(o: { workoutId: string; scoreValue: string; rx?: boolean; notes?: string }) {
  const f = new FormData()
  f.set('workoutId', o.workoutId)
  f.set('scoreValue', o.scoreValue)
  if (o.rx) f.set('rx', 'on')
  if (o.notes) f.set('notes', o.notes)
  return f
}

function mockWith(priors: { score_value: number; workout_id: string }[], scoringType = 'time') {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      workouts: { data: { title: 'Fran', scoring_type: scoringType }, error: null },
      workout_scores: { data: priors, error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('flags a PR when the new time beats the prior best in the same rx bracket', async () => {
  const rls = mockWith([{ score_value: 222, workout_id: 'w-old' }])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '210', rx: true }))
  expect(res.error).toBeNull()
  expect(res.pr).toEqual({ benchmark: 'Fran', rx: true, scoringType: 'time', newScore: 210, prevBest: 222 })
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(true)
})

test('a slower time is not a PR', async () => {
  const rls = mockWith([{ score_value: 222, workout_id: 'w-old' }])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '230', rx: true }))
  expect(res.pr).toBeNull()
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(false)
})

test('first time on a benchmark is not a PR', async () => {
  const rls = mockWith([])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w1', scoreValue: '200', rx: true }))
  expect(res.pr).toBeNull()
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(false)
})

test('the current workout is excluded from its own prior-best', async () => {
  // The only "prior" row is this very workout → no genuine prior → not a PR.
  const rls = mockWith([{ score_value: 100, workout_id: 'w-today' }])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '90', rx: true }))
  expect(res.pr).toBeNull()
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(false)
})

test('scopes the prior-best lookup to same rx bracket, box, athlete, and title', async () => {
  const rls = mockWith([])
  serverCreate.mockResolvedValue(rls)
  await logScore({ error: null, pr: null }, fd({ workoutId: 'w1', scoreValue: '200', rx: true }))
  const ws = rls.builder('workout_scores')
  expect(ws.eq).toHaveBeenCalledWith('rx', true)
  expect(ws.eq).toHaveBeenCalledWith('athlete_id', 'a1')
  expect(ws.eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(ws.ilike).toHaveBeenCalledWith('workouts.title', 'Fran')
})

test('validation error returns pr: null before any DB call', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: {} })
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: '', scoreValue: '200' }))
  expect(res).toEqual({ error: 'Enter a valid score.', pr: null })
  expect(rls.builder('workout_scores')).toBeUndefined()
})

test('a Scaled rep-count PR is detected (non-time, higher is better)', async () => {
  const rls = mockWith([{ score_value: 120, workout_id: 'w-old' }], 'amrap')
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '150' })) // rx omitted → Scaled
  expect(res.pr).toEqual({ benchmark: 'Fran', rx: false, scoringType: 'amrap', newScore: 150, prevBest: 120 })
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(true)
  // bracket isolation: the prior-best lookup was scoped to the Scaled bracket
  expect(rls.builder('workout_scores').eq).toHaveBeenCalledWith('rx', false)
})

test('escapes ILIKE wildcards in the benchmark title', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      workouts: { data: { title: '50% Death_by', scoring_type: 'time' }, error: null },
      workout_scores: { data: [], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  await logScore({ error: null, pr: null }, fd({ workoutId: 'w1', scoreValue: '200', rx: true }))
  expect(rls.builder('workout_scores').ilike).toHaveBeenCalledWith('workouts.title', '50\\% Death\\_by')
})

test('surfaces a DB error from the upsert and does not celebrate', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      workouts: { data: { title: 'Fran', scoring_type: 'time' }, error: null },
      workout_scores: { data: [], error: { message: 'db down' } },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w1', scoreValue: '200', rx: true }))
  expect(res).toEqual({ error: 'Could not log your score.', pr: null }) // sanitized, not the raw DB message
})
