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
    results: { bookings: { data: { credit_id: null }, error: null } },
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

test('a failing notify never fails the cancel', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: null }, error: null } },
  }))
  emailMock.mockRejectedValueOnce(new Error('resend down'))
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
