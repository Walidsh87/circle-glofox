import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markContacted } from '@/app/dashboard/retention/_actions/mark-contacted'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete with no write', async () => {
  const rls = makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await markContacted('a2')
  expect(res.error).toMatch(/owners and coaches/i)
  expect(rls.builder('member_outreach')).toBeUndefined()
})

test('inserts a box-scoped outreach row with contacted_by', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_outreach: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await markContacted('a2')
  expect(res.error).toBeNull()
  const arg = rls.builder('member_outreach').insert.mock.calls[0][0]
  expect(arg).toEqual(expect.objectContaining({ box_id: 'b1', athlete_id: 'a2', contacted_by: 'coach1' }))
})
