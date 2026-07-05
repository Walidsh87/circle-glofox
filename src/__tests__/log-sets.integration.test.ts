import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { logSets, deleteSetDay } from '@/app/dashboard/program/_actions/log-sets'
import type { SetEntry } from '@/lib/program-log'

const entry = (o: Partial<SetEntry>): SetEntry => ({ setNumber: 1, weightKg: null, reps: null, durationSeconds: null, distanceMeters: null, calories: null, ...o })

beforeEach(() => vi.clearAllMocks())

const owns = () =>
  makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      program_exercises: { data: { id: 'ex1', box_id: 'b1', athlete_id: 'a1' }, error: null },
      program_set_logs: { data: null, error: null },
    },
  })

test('rejects an invalid date before any DB call', async () => {
  serverCreate.mockResolvedValue(owns())
  expect((await logSets('ex1', 'nope', [entry({ setNumber: 1, weightKg: 100, reps: 5 })])).error).toMatch(/date/i)
})

test('rejects invalid set entries', async () => {
  serverCreate.mockResolvedValue(owns())
  expect((await logSets('ex1', '2026-06-20', [])).error).toMatch(/at least one/i)
})

test("rejects logging against another member's exercise", async () => {
  serverCreate.mockResolvedValue(
    makeSupabaseMock({ user: { id: 'a1' }, results: { program_exercises: { data: { id: 'ex1', box_id: 'b1', athlete_id: 'OTHER' }, error: null } } }),
  )
  expect((await logSets('ex1', '2026-06-20', [entry({ setNumber: 1, weightKg: 100, reps: 5 })])).error).toMatch(/not found/i)
})

test('upserts set rows with box/athlete stamped, kg→grams, idempotent key', async () => {
  const rls = owns(); serverCreate.mockResolvedValue(rls)
  const res = await logSets('ex1', '2026-06-20', [
    entry({ setNumber: 1, weightKg: 102.5, reps: 5 }),
    entry({ setNumber: 2, weightKg: null, reps: null }),
  ])
  expect(res.error).toBeNull()
  expect(rls.builder('program_set_logs').upsert).toHaveBeenCalledWith(
    [
      expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', exercise_id: 'ex1', performed_on: '2026-06-20', set_number: 1, weight_grams: 102500, reps: 5 }),
      expect.objectContaining({ set_number: 2, weight_grams: null, reps: null }),
    ],
    expect.objectContaining({ onConflict: 'exercise_id,athlete_id,performed_on,set_number' }),
  )
})

test("a time-metric exercise writes duration_seconds and rejects load-only entries", async () => {
  const timeEx = () =>
    makeSupabaseMock({
      user: { id: 'a1' },
      results: {
        program_exercises: { data: { id: 'ex1', box_id: 'b1', athlete_id: 'a1', metric: 'time' }, error: null },
        program_set_logs: { data: null, error: null },
      },
    })

  // load-shaped entry against a time exercise → validation error, no write
  let rls = timeEx(); serverCreate.mockResolvedValue(rls)
  const bad = await logSets('ex1', '2026-06-20', [entry({ setNumber: 1, weightKg: 100, reps: 5 })])
  expect(bad.error).toMatch(/time/i)
  expect(rls.builder('program_set_logs')?.upsert).toBeUndefined()

  // proper duration entry → row carries duration_seconds, load fields null
  rls = timeEx(); serverCreate.mockResolvedValue(rls)
  const ok = await logSets('ex1', '2026-06-20', [entry({ setNumber: 1, durationSeconds: 462 })])
  expect(ok.error).toBeNull()
  expect(rls.builder('program_set_logs').upsert).toHaveBeenCalledWith(
    [expect.objectContaining({ duration_seconds: 462, weight_grams: null, reps: null, distance_meters: null, calories: null })],
    expect.anything(),
  )
})

test('deleteSetDay removes a day scoped to self', async () => {
  const rls = owns(); serverCreate.mockResolvedValue(rls)
  const res = await deleteSetDay('ex1', '2026-06-20')
  expect(res.error).toBeNull()
  expect(rls.builder('program_set_logs').delete).toHaveBeenCalled()
  expect(rls.builder('program_set_logs').eq).toHaveBeenCalledWith('athlete_id', 'a1')
  expect(rls.builder('program_set_logs').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('program_set_logs').eq).toHaveBeenCalledWith('performed_on', '2026-06-20')
})
