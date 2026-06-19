import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { loadActivePackages } from '@/app/dashboard/desk/_actions/load-active-packages'

beforeEach(() => vi.clearAllMocks())

test('blocks non-staff', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await loadActivePackages()).error).toMatch(/staff/i)
})

test('returns active packages for staff', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null },
    packages: { data: [{ id: 'pk1', name: '10-pack', price_aed: 500 }], error: null },
  } }))
  const res = await loadActivePackages()
  expect(res.error).toBeNull()
  expect(res.packages).toEqual([{ id: 'pk1', name: '10-pack', price_aed: 500 }])
})

test('returns error on db failure', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null },
    packages: { data: null, error: { message: 'db error' } },
  } }))
  const res = await loadActivePackages()
  expect(res.error).toMatch(/something went wrong/i) // sanitized, not the raw DB message
  expect(res.packages).toBeUndefined()
})
