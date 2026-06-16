import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { searchPeople } from '@/app/dashboard/desk/_actions/search-people'

beforeEach(() => vi.clearAllMocks())

test('blocks non-staff', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  const res = await searchPeople('sara')
  expect(res.error).toMatch(/staff/i)
})

test('returns ranked member+lead hits for staff', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'r1' },
    results: {
      profiles: [
        { data: { box_id: 'b1', role: 'receptionist', full_name: 'Front Desk' }, error: null },
        { data: [{ id: 'm1', full_name: 'Sara Ali', email: 'sara@x.com', phone: null }], error: null },
      ],
      leads: { data: [{ id: 'l1', full_name: 'Sara Lead', email: null, phone: '+97150', source: 'walk_in', status: 'new' }], error: null },
      memberships: { data: [{ athlete_id: 'm1', payment_status: 'paid', end_date: null, last_paid_date: '2026-06-01', frozen_from: null, frozen_until: null }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await searchPeople('sara')
  expect(res.error).toBeNull()
  expect(res.hits!.length).toBe(2)
  expect(res.hits![0].kind).toBe('member')
})

test('empty query returns no hits, no error', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const res = await searchPeople('   ')
  expect(res).toEqual({ error: null, hits: [] })
})
