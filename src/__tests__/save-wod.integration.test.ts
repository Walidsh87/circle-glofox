import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveWod } from '@/app/dashboard/wod/_actions/save-wod'

function fd(o: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}
const base = { date: '2026-07-01', title: 'Fran', description: '21-15-9', scoringType: 'time' }

beforeEach(() => vi.clearAllMocks())

test('persists scaling tiers on the workout', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, workouts: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const scaling = JSON.stringify([{ label: 'Rx', description: '42.5/30kg' }, { label: 'Scaled', description: '30/20kg' }])
  const res = await saveWod({ error: null }, fd({ ...base, scaling }))
  expect(res.error).toBeNull()
  const row = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(row.scaling).toEqual([{ label: 'Rx', description: '42.5/30kg' }, { label: 'Scaled', description: '30/20kg' }])
})

test('rejects a scaling tier missing a description (no write)', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const scaling = JSON.stringify([{ label: 'Rx', description: '' }])
  const res = await saveWod({ error: null }, fd({ ...base, scaling }))
  expect(res.error).toMatch(/scaling tier/i)
  expect(rls.builder('workouts')).toBeUndefined()
})

test('a WOD with no scaling saves with scaling null/[]', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, workouts: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveWod({ error: null }, fd(base))
  expect(res.error).toBeNull()
  expect(rls.builder('workouts').upsert.mock.calls[0][0].scaling).toEqual([])
})

test('rejects a non-staff athlete', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await saveWod({ error: null }, fd(base))
  expect(res.error).toMatch(/owners and coaches/i)
})
