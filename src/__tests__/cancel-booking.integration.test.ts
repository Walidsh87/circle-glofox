import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, emailMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  emailMock: vi.fn(() => Promise.resolve({ id: 'e1', error: null })),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendWaitlistEmail: emailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { cancelBooking } from '@/app/dashboard/schedule/_actions/cancel-booking'

beforeEach(() => vi.clearAllMocks())

test('credit-backed booking → deletes and refunds the credit', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: 'batch-1' }, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(rls.builder('bookings').delete).toHaveBeenCalled()
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
})

test('membership-covered booking (no credit_id) → deletes, no refund', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: null }, error: null } },
  }))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('a freed spot emails the next waitlister', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: null }, error: null },
      class_instances: { data: { box_id: 'b1', starts_at: '2026-07-01T06:00:00Z', boxes: { late_cancel_hours: 0 } }, error: null },
    },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: {
      class_waitlist: { data: { athlete_id: 'a2' }, error: null },
      profiles: { data: { email: 'mike@x.com', full_name: 'Mike' }, error: null },
      class_instances: { data: { starts_at: '2026-07-01T06:00:00Z', class_templates: { name: 'Fran' }, boxes: { name: 'Iron Box', timezone: 'Asia/Dubai' } }, error: null },
    },
  }))
  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mike@x.com', className: 'Fran', gymName: 'Iron Box' }))
})

test('the waitlist-notify reads are box-scoped to the caller box', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: null }, error: null },
      class_instances: { data: { box_id: 'b1', starts_at: '2026-07-01T06:00:00Z', boxes: { late_cancel_hours: 0 } }, error: null },
    },
  }))
  const svc = makeSupabaseMock({
    results: {
      class_waitlist: { data: { athlete_id: 'a2' }, error: null },
      profiles: { data: { email: 'mike@x.com', full_name: 'Mike' }, error: null },
      class_instances: { data: { starts_at: '2026-07-01T06:00:00Z', class_templates: { name: 'Fran' }, boxes: { name: 'Iron Box', timezone: 'Asia/Dubai' } }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)
  await cancelBooking('class-1')
  expect(svc.builder('class_waitlist').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('a foreign instance (not in the caller box) skips waitlist notify', async () => {
  // policyInstance comes back null via RLS → no box → the notify block must not run.
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: null }, error: null } },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: { class_waitlist: { data: { athlete_id: 'a2' }, error: null } },
  }))
  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(emailMock).not.toHaveBeenCalled()
})

test('a failing notify never fails the cancel', async () => {
  emailMock.mockRejectedValueOnce(new Error('resend down'))
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: null }, error: null },
      class_instances: { data: { box_id: 'b1', starts_at: '2026-07-01T06:00:00Z', boxes: { late_cancel_hours: 0 } }, error: null },
    },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: {
      class_waitlist: { data: { athlete_id: 'a2' }, error: null },
      profiles: { data: { email: 'mike@x.com', full_name: 'Mike' }, error: null },
      class_instances: { data: { starts_at: '2026-07-01T06:00:00Z', class_templates: { name: 'Fran' }, boxes: { name: 'Iron Box', timezone: 'Asia/Dubai' } }, error: null },
    },
  }))
  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
})

test('a late cancel of a credit booking forfeits the credit (no refund)', async () => {
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h away, inside a 2h window
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: 'batch-1' }, error: null },
      class_instances: { data: { starts_at: startsAt, boxes: { late_cancel_hours: 2 } }, error: null },
    },
  }))
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(res.forfeited).toBe(true)
  expect(svc.rpc).not.toHaveBeenCalledWith('refund_credit', expect.anything())
})

test('an early cancel still refunds the credit', async () => {
  const startsAt = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString() // 100h away
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: 'batch-1' }, error: null },
      class_instances: { data: { starts_at: startsAt, boxes: { late_cancel_hours: 2 } }, error: null },
    },
  }))
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(res.forfeited).toBeFalsy()
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
})
