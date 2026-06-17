import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  addAvailabilityWindow,
  removeAvailabilityWindow,
} from '@/app/dashboard/availability/_actions/availability-windows'

beforeEach(() => vi.clearAllMocks())

test('addAvailabilityWindow: invalid time rejected before guard', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await addAvailabilityWindow('c1', 1, '10:00', '06:00')).error).toMatch(/after/i)
})

test('addAvailabilityWindow: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'athlete', full_name: 'A' }, error: null },
  } }))
  expect((await addAvailabilityWindow('a1', 1, '06:00', '10:00')).error).toMatch(/staff/i)
})

test('addAvailabilityWindow: coach adds own window (box-scoped insert)', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                                // coach-in-box check
    ],
    coach_availability: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await addAvailabilityWindow('c1', 1, '06:00', '10:00')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_availability').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', weekday: 1, start_time: '06:00', end_time: '10:00',
  }))
})

test('addAvailabilityWindow: duplicate window rejected with a friendly message', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                                // coach-in-box check
    ],
    coach_availability: { data: null, error: { code: '23505', message: 'duplicate key' } },
  } }))
  expect((await addAvailabilityWindow('c1', 1, '06:00', '10:00')).error).toMatch(/already exists/i)
})

test('addAvailabilityWindow: coach cannot edit another coach', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await addAvailabilityWindow('c2', 1, '06:00', '10:00')).error).toMatch(/your own/i)
})

test('addAvailabilityWindow: manager on behalf of a coach succeeds', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                               // coach-in-box check
    ],
    coach_availability: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await addAvailabilityWindow('c2', 2, '16:00', '20:00')).error).toBeNull()
})

test('addAvailabilityWindow: manager target is not a coach → rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
      { data: { role: 'receptionist' }, error: null },
    ],
  } }))
  expect((await addAvailabilityWindow('r1', 1, '06:00', '10:00')).error).toMatch(/not found/i)
})

test('removeAvailabilityWindow: coach removes own row', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_availability: [{ data: { coach_id: 'c1' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await removeAvailabilityWindow('w1')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_availability').delete).toHaveBeenCalled()
  expect(rls.builder('coach_availability').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('removeAvailabilityWindow: coach cannot remove another coach row', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_availability: { data: { coach_id: 'c2' }, error: null },
  } }))
  expect((await removeAvailabilityWindow('w1')).error).toMatch(/your own/i)
})
