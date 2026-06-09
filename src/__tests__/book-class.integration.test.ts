import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { bookClass } from '@/app/dashboard/schedule/_actions/book-class'

beforeEach(() => vi.clearAllMocks())

// RLS client: athlete u1 in box b1, booking a class with capacity 10.
function rlsClient(opts: { bookingInsertError?: { code?: string; message: string } } = {}) {
  return makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      class_instances: { data: { capacity: 10, box_id: 'b1' }, error: null },
      profiles: { data: { box_id: 'b1' }, error: null },
      bookings: { data: null, error: opts.bookingInsertError ?? null },
    },
  })
}

test('refuses when no paid membership and no credits — no booking, signals needsCredits', async () => {
  serverCreate.mockResolvedValue(rlsClient())
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: {
      memberships: { data: [], error: null },        // no membership
      package_credits: { data: [], error: null },     // no credits
      bookings: { data: null, error: null },          // capacity count
    },
  }))

  const res = await bookClass('class-1')
  expect(res.error).toMatch(/membership or class credits/i)
  expect(res.needsCredits).toBe(true)
})

test('paid membership books free — no credit consumed', async () => {
  const rls = rlsClient()
  serverCreate.mockResolvedValue(rls)
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
      package_credits: { data: [], error: null },
      bookings: { data: null, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBeNull()
  // booked via the RLS client with no credit_id
  expect(rls.builder('bookings').insert).toHaveBeenCalledWith(
    expect.objectContaining({ class_instance_id: 'class-1', athlete_id: 'u1' }),
  )
  const payload = rls.builder('bookings').insert.mock.calls[0][0]
  expect(payload).not.toHaveProperty('credit_id')
  // consume_credit not called
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('no membership + a credit → consumes one and books linked to it', async () => {
  serverCreate.mockResolvedValue(rlsClient())
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [], error: null },
      package_credits: { data: [{ id: 'batch-1', credits_remaining: 5, expires_at: null }], error: null },
      bookings: { data: null, error: null },
    },
    rpc: { data: 4, error: null }, // consume_credit → 4 remaining
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'batch-1' })
  expect(svc.builder('bookings').insert).toHaveBeenCalledWith(
    expect.objectContaining({ class_instance_id: 'class-1', athlete_id: 'u1', credit_id: 'batch-1' }),
  )
})

test('a dependent books free via the primary’s paid membership', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'dep1' },
    results: {
      class_instances: { data: { capacity: 10, box_id: 'b1' }, error: null },
      profiles: { data: { box_id: 'b1', household_id: 'hh1' }, error: null },
      households: { data: { primary_athlete_id: 'primary1' }, error: null },
      bookings: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
      package_credits: { data: [], error: null },
      bookings: { data: null, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBeNull()
  expect(svc.builder('memberships').eq).toHaveBeenCalledWith('athlete_id', 'primary1') // membership resolved to the primary
  expect(rls.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'dep1' })) // booked for self
})

test('credit consumed but booking insert fails → refunds the credit', async () => {
  serverCreate.mockResolvedValue(rlsClient())
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [], error: null },
      package_credits: { data: [{ id: 'batch-1', credits_remaining: 5, expires_at: null }], error: null },
      bookings: { data: null, error: { code: '23505', message: 'dup' } }, // already booked
    },
    rpc: { data: 4, error: null },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBe('Already booked.')
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
  // exactly one consume + one refund — guards against a double-refund regression
  expect(svc.rpc).toHaveBeenCalledTimes(2)
})
