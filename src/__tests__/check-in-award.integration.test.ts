import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { checkIn } from '@/app/dashboard/whiteboard/_actions/check-in'

beforeEach(() => vi.clearAllMocks())

// Staff RLS client: coach in box b1, athlete has a paid membership (skips the credit path).
function rls() {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null, last_paid_date: '2026-06-01' }], error: null },
    },
  })
}
const ci = (d: string) => ({ class_instances: { starts_at: `${d}T06:00:00Z` } })

test('a check-in that lands exactly on a milestone records the achievement', async () => {
  serverCreate.mockResolvedValue(rls())
  // 25 checked-in bookings (all in one week) → total 25 = the first milestone.
  const svc = makeSupabaseMock({ results: { bookings: { data: Array(25).fill(ci('2026-06-01')), error: null } } })
  serviceCreate.mockReturnValue(svc)

  const res = await checkIn('inst1', 'ath1')
  expect(res.error).toBeNull()
  const arg = svc.builder('member_achievements').upsert.mock.calls[0][0]
  expect(arg).toEqual(expect.arrayContaining([
    expect.objectContaining({ box_id: 'b1', athlete_id: 'ath1', kind: 'milestone', threshold: 25 }),
  ]))
})

test('no crossing → no achievement insert', async () => {
  serverCreate.mockResolvedValue(rls())
  const svc = makeSupabaseMock({ results: { bookings: { data: Array(10).fill(ci('2026-06-01')), error: null } } })
  serviceCreate.mockReturnValue(svc)
  const ach = svc.from('member_achievements') // pre-create the builder to assert on it

  const res = await checkIn('inst1', 'ath1')
  expect(res.error).toBeNull()
  expect(ach.upsert).not.toHaveBeenCalled()
})

test('a throwing award never fails the check-in', async () => {
  serverCreate.mockResolvedValue(rls())
  const svc = makeSupabaseMock({ results: { bookings: { data: Array(25).fill(ci('2026-06-01')), error: null } } })
  serviceCreate.mockReturnValue(svc)
  svc.from('member_achievements').upsert.mockImplementation(() => { throw new Error('db down') })

  const res = await checkIn('inst1', 'ath1')
  expect(res.error).toBeNull()
})
