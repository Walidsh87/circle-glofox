import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { checkIn } from '@/app/dashboard/whiteboard/_actions/check-in'

beforeEach(() => vi.clearAllMocks())

// Staff coach in box b1; the athlete being checked in has NO paid membership.
function staffClient() {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [], error: null }, // no_membership
    },
  })
}

test('blocks an unpaid athlete with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(staffClient())
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: { bookings: { data: { credit_id: null }, error: null } },
  }))

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('no_membership')
})

test('allows a no-membership athlete whose booking is credit-backed', async () => {
  serverCreate.mockResolvedValue(staffClient())
  const svc = makeSupabaseMock({
    results: { bookings: { data: { credit_id: 'batch-1' }, error: null } },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(
    expect.objectContaining({ checked_in: true }),
  )
})

test('blocks a frozen athlete with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null, last_paid_date: null, frozen_from: '2026-01-01', frozen_until: null }], error: null },
    },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: { credit_id: null }, error: null } } }))

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('frozen')
})

test('allows an athlete with an active-but-unpaid membership when the booking is credit-backed', async () => {
  // 'unpaid' (active row, not paid) and 'no_membership' share the credit fall-through path.
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [{ payment_status: 'unpaid', end_date: null, last_paid_date: null }], error: null },
    },
  }))
  const svc = makeSupabaseMock({
    results: { bookings: { data: { credit_id: 'batch-1' }, error: null } },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(
    expect.objectContaining({ checked_in: true }),
  )
})
