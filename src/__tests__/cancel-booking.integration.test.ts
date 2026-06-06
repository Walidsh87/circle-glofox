import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { cancelBooking } from '@/app/dashboard/schedule/_actions/cancel-booking'

beforeEach(() => vi.clearAllMocks())

test('credit-backed booking → deletes and refunds the credit', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: 'batch-1' }, error: null } },
  }))
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
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
