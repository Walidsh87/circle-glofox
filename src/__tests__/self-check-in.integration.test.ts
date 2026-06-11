import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { selfCheckIn } from '@/app/checkin/_actions/self-check-in'

beforeEach(() => vi.clearAllMocks())

const IN_WINDOW = () => new Date(Date.now() + 10 * 60_000).toISOString()   // starts in 10 min
const TOO_EARLY = () => new Date(Date.now() + 2 * 3_600_000).toISOString() // starts in 2 h
const TOO_LATE  = () => new Date(Date.now() - 2 * 3_600_000).toISOString() // started 2 h ago

function rlsPaid() {
  return makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      profiles: { data: { box_id: 'b1', household_id: null }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
    },
  })
}

test('rejects an unauthenticated caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('errors when the caller has no booking for the class', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: null, error: null } } }))
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Booking not found.')
})

test('is idempotent when already checked in', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: { data: { checked_in: true, class_instances: { starts_at: IN_WINDOW() } }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('rejects before the window opens', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: { data: { checked_in: false, class_instances: { starts_at: TOO_EARLY() } }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Check-in opens 60 minutes before class.')
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('rejects after the window closes', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: { data: { checked_in: false, class_instances: { starts_at: TOO_LATE() } }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Check-in for this class has closed.')
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('blocks an unpaid member with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      profiles: { data: { box_id: 'b1', household_id: null }, error: null },
      memberships: { data: [], error: null }, // no_membership
    },
  }))
  const svc = makeSupabaseMock({ results: { bookings: [
    { data: { checked_in: false, class_instances: { starts_at: IN_WINDOW() } }, error: null }, // lookup
    { data: { credit_id: null }, error: null },                                                 // credit check
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Please see the front desk about your membership.')
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('lets a credit-backed booking through without a paid membership', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      profiles: { data: { box_id: 'b1', household_id: null }, error: null },
      memberships: { data: [], error: null },
    },
  }))
  const svc = makeSupabaseMock({ results: { bookings: [
    { data: { checked_in: false, class_instances: { starts_at: IN_WINDOW() } }, error: null }, // lookup
    { data: { credit_id: 'batch-1' }, error: null },                                            // credit check
    { data: null, error: null },                                                                // update
    { data: [], error: null },                                                                  // award history
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(expect.objectContaining({ checked_in: true }))
})

test('checks a paid member into an in-window booked class', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: [
    { data: { checked_in: false, class_instances: { starts_at: IN_WINDOW() } }, error: null }, // lookup
    { data: null, error: null },                                                                // update
    { data: [], error: null },                                                                  // award history
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(expect.objectContaining({ checked_in: true }))
  expect(svc.builder('bookings').eq).toHaveBeenCalledWith('athlete_id', 'ath1') // own booking only
})
