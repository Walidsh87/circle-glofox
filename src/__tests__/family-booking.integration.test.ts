import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendWaitlistEmail: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushTo: vi.fn(async () => 0) }))

import { bookClass } from '@/app/dashboard/schedule/_actions/book-class'
import { cancelBooking } from '@/app/dashboard/schedule/_actions/cancel-booking'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

const FUTURE = new Date(Date.now() + 48 * 3600_000).toISOString()

test('bookClass rejects a target outside the household and books nothing', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },                  // rail: own
      { data: { household_id: 'h2', role: 'athlete' }, error: null }, // rail: target
    ],
  } }))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await bookClass('ci1', 'a2')
  expect(res.error).toBe('That member is not in your household.')
  expect(svc.builder('bookings')).toBeUndefined()
})

test('bookClass books the dependent via the service client (membership path)', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },                          // rail: own
      { data: { household_id: 'h1', role: 'athlete' }, error: null },         // rail: target
      { data: { box_id: 'b1', household_id: 'h1' }, error: null },            // target profile
    ],
    class_instances: { data: { capacity: 12, box_id: 'b1', starts_at: FUTURE, boxes: { booking_close_minutes: 0 } }, error: null },
    households: { data: { primary_athlete_id: 'a1' }, error: null },
  } }))
  const svc = makeSupabaseMock({ results: {
    bookings: [
      { data: null, error: null, count: 3 },  // capacity count
      { data: null, error: null },            // on-behalf insert (service)
    ],
    memberships: { data: [{ payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null }], error: null },
    package_credits: { data: [], error: null },
    class_waitlist: { data: null, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await bookClass('ci1', 'a2')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'a2', box_id: 'b1' }))
  expect(svc.builder('class_waitlist').eq).toHaveBeenCalledWith('athlete_id', 'a2')
})

test('bookClass keys the credit lookup to the target', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'athlete' }, error: null },
      { data: { box_id: 'b1', household_id: 'h1' }, error: null },
    ],
    class_instances: { data: { capacity: 12, box_id: 'b1', starts_at: FUTURE, boxes: { booking_close_minutes: 0 } }, error: null },
    households: { data: { primary_athlete_id: 'a1' }, error: null },
  } }))
  const svc = makeSupabaseMock({ results: {
    bookings: { data: null, error: null, count: 3 },
    memberships: { data: [], error: null },        // not paid → credit path
    package_credits: { data: [], error: null },    // no credits either
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await bookClass('ci1', 'a2')
  expect(res.needsCredits).toBe(true)
  expect(svc.builder('package_credits').eq).toHaveBeenCalledWith('athlete_id', 'a2')
})

test('cancelBooking rejects a non-household target', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: { data: { household_id: null }, error: null },
  } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await cancelBooking('ci1', 'a2')
  expect(res.error).toBe('You are not part of a household.')
})

test('cancelBooking deletes the dependent booking via the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'athlete' }, error: null },
    ],
    class_instances: { data: { starts_at: FUTURE, boxes: { late_cancel_hours: 0 } }, error: null },
    class_waitlist: { data: [], error: null }, // promotion scan finds nobody
  } }))
  const svc = makeSupabaseMock({ results: {
    bookings: [
      { data: { credit_id: null }, error: null }, // on-behalf lookup
      { data: null, error: null },                // delete
    ],
    class_waitlist: { data: [], error: null },
    class_instances: { data: { capacity: 12, starts_at: FUTURE }, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await cancelBooking('ci1', 'a2')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').delete).toHaveBeenCalled()
  expect(svc.builder('bookings').eq).toHaveBeenCalledWith('athlete_id', 'a2')
})
