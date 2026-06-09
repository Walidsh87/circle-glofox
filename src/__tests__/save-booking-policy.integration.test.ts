import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveBookingPolicy } from '@/app/dashboard/settings/_actions/save-booking-policy'

beforeEach(() => vi.clearAllMocks())

const owner = () => makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })

test('owner saves both policy columns box-scoped', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await saveBookingPolicy(30, 2)
  expect(res.error).toBeNull()
  expect(svc.builder('boxes').update).toHaveBeenCalledWith({ booking_close_minutes: 30, late_cancel_hours: 2 })
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})

test('rejects negative or non-integer values before any DB call', async () => {
  serverCreate.mockResolvedValue(owner()); serviceCreate.mockReturnValue(makeSupabaseMock({}))
  expect((await saveBookingPolicy(-1, 2)).error).toMatch(/whole numbers/i)
  expect((await saveBookingPolicy(30, 1.5)).error).toMatch(/whole numbers/i)
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  expect((await saveBookingPolicy(30, 2)).error).toMatch(/owners/i)
})
