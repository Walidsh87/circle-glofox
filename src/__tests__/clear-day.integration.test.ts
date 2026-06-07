import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { clearDay } from '@/app/dashboard/programming/_actions/clear-day'

beforeEach(() => vi.clearAllMocks())

function staffWith(workout: unknown, scoreCount: number) {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: workout, error: null },
      workout_scores: { data: null, error: null, count: scoreCount } as never,
    },
  })
}

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await clearDay('2026-06-10')
  expect(res.error).toMatch(/owners and coaches/i)
})

test('refuses to clear a day that already has logged scores — no delete', async () => {
  const rls = staffWith({ id: 'w1' }, 3)
  serverCreate.mockResolvedValue(rls)
  const res = await clearDay('2026-06-10')
  expect(res.error).toMatch(/scores/i)
  expect(rls.builder('workouts').delete).not.toHaveBeenCalled()
})

test('clears a day with no scores', async () => {
  const rls = staffWith({ id: 'w1' }, 0)
  serverCreate.mockResolvedValue(rls)
  const res = await clearDay('2026-06-10')
  expect(res.error).toBeNull()
  expect(rls.builder('workouts').delete).toHaveBeenCalled()
})
