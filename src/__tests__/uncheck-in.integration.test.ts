import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { uncheckIn } from '@/app/dashboard/whiteboard/_actions/uncheck-in'

beforeEach(() => vi.clearAllMocks())

function staffClient() {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'Coach One' }, error: null } },
  })
}

test('reverts a check-in: sets checked_in=false + nulls checked_in_at, box-scoped', async () => {
  serverCreate.mockResolvedValue(staffClient())
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await uncheckIn('class-1', 'athlete-1')

  expect(res.error).toBeNull()
  const bookings = svc.builder('bookings')
  expect(bookings.update).toHaveBeenCalledWith({ checked_in: false, checked_in_at: null })
  expect(bookings.eq).toHaveBeenCalledWith('class_instance_id', 'class-1')
  expect(bookings.eq).toHaveBeenCalledWith('athlete_id', 'athlete-1')
  expect(bookings.eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('rejects a non-staff caller and writes nothing', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'ath1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete', full_name: null }, error: null } },
  }))

  const res = await uncheckIn('class-1', 'athlete-1')

  expect(res.error).toBe('Only staff can change attendance.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('returns the db error message when the update fails', async () => {
  serverCreate.mockResolvedValue(staffClient())
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: { bookings: { data: null, error: { message: 'update failed' } } },
  }))

  const res = await uncheckIn('class-1', 'athlete-1')

  expect(res.error).toBe('update failed')
})
