import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { logBest } from '@/app/dashboard/skill-bests/_actions/log-best'

beforeEach(() => vi.clearAllMocks())

const athlete = () =>
  makeSupabaseMock({
    user: { id: 'a1' },
    results: { profiles: { data: { box_id: 'b1' }, error: null }, athlete_skill_bests: { data: null, error: null } },
  })

test('logs a reps best (box + athlete bound from the session)', async () => {
  const rls = athlete(); serverCreate.mockResolvedValue(rls)
  const res = await logBest('pullup', '14')
  expect(res.error).toBeNull()
  expect(rls.builder('athlete_skill_bests').insert).toHaveBeenCalledWith({
    box_id: 'b1', athlete_id: 'a1', skill_key: 'pullup', value: 14,
  })
})

test('weight input in kg is stored as grams', async () => {
  const rls = athlete(); serverCreate.mockResolvedValue(rls)
  const res = await logBest('weighted_pullup', '12.5')
  expect(res.error).toBeNull()
  expect(rls.builder('athlete_skill_bests').insert).toHaveBeenCalledWith(
    expect.objectContaining({ skill_key: 'weighted_pullup', value: 12500 }),
  )
})

test('time input mm:ss is stored as seconds', async () => {
  const rls = athlete(); serverCreate.mockResolvedValue(rls)
  const res = await logBest('row_2k', '7:45')
  expect(res.error).toBeNull()
  expect(rls.builder('athlete_skill_bests').insert).toHaveBeenCalledWith(
    expect.objectContaining({ skill_key: 'row_2k', value: 465 }),
  )
})

test('rejects an unknown skill before any DB call', async () => {
  const rls = athlete(); serverCreate.mockResolvedValue(rls)
  const res = await logBest('nope', '5')
  expect(res.error).toMatch(/skill/i)
  expect(rls.builder('athlete_skill_bests')?.insert).toBeUndefined()
})

test('rejects an out-of-range value before any DB call', async () => {
  const rls = athlete(); serverCreate.mockResolvedValue(rls)
  const res = await logBest('pullup', '1001')
  expect(res.error).toBeTruthy()
  expect(rls.builder('athlete_skill_bests')?.insert).toBeUndefined()
})

test('unauthenticated is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  expect((await logBest('pullup', '10')).error).toMatch(/authenticated/i)
})

test('a DB error is sanitized', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'a1' },
    results: { profiles: { data: { box_id: 'b1' }, error: null }, athlete_skill_bests: { data: null, error: { message: 'constraint xyz' } } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await logBest('pullup', '10')
  expect(res.error).toBeTruthy()
  expect(res.error).not.toMatch(/constraint/i)
})
