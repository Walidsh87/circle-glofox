import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { joinWaitlist } from '@/app/dashboard/schedule/_actions/join-waitlist'
import { leaveWaitlist } from '@/app/dashboard/schedule/_actions/leave-waitlist'

beforeEach(() => vi.clearAllMocks())

function rlsFor() {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      class_instances: { data: { capacity: 12, box_id: 'b1' }, error: null },
      profiles: { data: { box_id: 'b1' }, error: null },
      class_waitlist: { data: null, error: null },
    },
  })
}

test('rejects when the class is not full', async () => {
  serverCreate.mockResolvedValue(rlsFor())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: [], error: null, count: 5 } } }))
  const res = await joinWaitlist('c1')
  expect(res.error).toMatch(/isn't full/i)
})

test('rejects when already booked', async () => {
  serverCreate.mockResolvedValue(rlsFor())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: { id: 'bk1' }, error: null, count: 12 } } }))
  const res = await joinWaitlist('c1')
  expect(res.error).toMatch(/already booked/i)
})

test('joins when full and not booked', async () => {
  const rls = rlsFor()
  serverCreate.mockResolvedValue(rls)
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: null, error: null, count: 12 } } }))
  const res = await joinWaitlist('c1')
  expect(res.error).toBeNull()
  const arg = rls.builder('class_waitlist').insert.mock.calls[0][0]
  expect(arg).toEqual(expect.objectContaining({ box_id: 'b1', class_instance_id: 'c1', athlete_id: 'a1' }))
})

test('leaveWaitlist deletes the caller own row', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: { class_waitlist: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await leaveWaitlist('c1')
  expect(res.error).toBeNull()
  expect(rls.builder('class_waitlist').delete).toHaveBeenCalled()
  expect(rls.builder('class_waitlist').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})
