import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { previewImport, commitImport } from '@/app/dashboard/programming/_actions/import-batch'

// 3 valid days: 07-01, 07-02, 07-03
const paste = `2026-07-01 For Time
Fran
21-15-9 Thrusters Pull-ups

2026-07-02 AMRAP
Cindy
20 min: 5/10/15

2026-07-03 time
Murph
1 mile run`

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await previewImport(paste)
  expect(res.error).toMatch(/owners and coaches/i)
  expect(res.rows).toEqual([])
})

test('previewImport classifies NEW / REPLACE / BLOCKED', async () => {
  // 07-02 exists & unscored → REPLACE; 07-03 exists & scored → BLOCKED; 07-01 absent → NEW
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: [{ id: 'w2', date: '2026-07-02' }, { id: 'w3', date: '2026-07-03' }], error: null },
      workout_scores: { data: [{ workout_id: 'w3' }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await previewImport(paste)
  expect(res.error).toBeNull()
  expect(res.rows.map((r) => r.status)).toEqual(['NEW', 'REPLACE', 'BLOCKED'])
})

test('commitImport writes only NEW + REPLACE rows, box-scoped', async () => {
  // 07-03 exists & scored → BLOCKED; 07-01 + 07-02 absent → NEW
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: [{ id: 'w3', date: '2026-07-03' }], error: null },
      workout_scores: { data: [{ workout_id: 'w3' }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport(paste)
  expect(res.error).toBeNull()
  expect(res.written).toBe(2)
  const arg = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(arg).toEqual([
    expect.objectContaining({ box_id: 'b1', date: '2026-07-01', title: 'Fran', scoring_type: 'time', strength_lift: null, created_by: 'coach1' }),
    expect.objectContaining({ box_id: 'b1', date: '2026-07-02', title: 'Cindy', scoring_type: 'amrap' }),
  ])
  // Tenant isolation is locked by tests, not just by implementation: the existing-workouts
  // lookup is box-scoped, and the score lookup is scoped to ids from that box-scoped query.
  expect(rls.builder('workouts').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('workout_scores').in).toHaveBeenCalledWith('workout_id', ['w3'])
})

test('commitImport overwrites a REPLACE day (existing, unscored)', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: [{ id: 'w1', date: '2026-07-01' }], error: null },
      workout_scores: { data: [], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport('2026-07-01 time\nFran\n21-15-9')
  expect(res.error).toBeNull()
  expect(res.written).toBe(1)
  const arg = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(arg).toEqual([expect.objectContaining({ box_id: 'b1', date: '2026-07-01', title: 'Fran' })])
})

test('surfaces a DB error from the upsert without reporting a write', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: [], error: { message: 'db down' } },
      workout_scores: { data: [], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport('2026-07-01 time\nFran\n21-15-9')
  expect(res.error).toBe('db down')
  expect(res.written).toBe(0)
})

test('all-invalid paste writes nothing and never touches workouts', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport('2026-13-99\nBad\nstuff')
  expect(res.written).toBe(0)
  expect(rls.builder('workouts')).toBeUndefined()
})

test('empty paste returns no rows and writes nothing', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport('   \n\n')
  expect(res).toEqual({ error: null, written: 0, rows: [] })
  expect(rls.builder('workouts')).toBeUndefined()
})
