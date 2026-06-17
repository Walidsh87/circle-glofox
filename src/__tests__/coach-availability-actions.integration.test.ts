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

test('removeAvailabilityWindow: manager removes another coach row', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    coach_availability: [{ data: { coach_id: 'c2' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await removeAvailabilityWindow('w1')).error).toBeNull()
  expect(rls.builder('coach_availability').delete).toHaveBeenCalled()
})

import {
  requestTimeOff,
  decideTimeOff,
  cancelTimeOff,
} from '@/app/dashboard/availability/_actions/time-off'

test('requestTimeOff: coach self request is pending', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                               // coach-in-box check
    ],
    coach_time_off: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await requestTimeOff('c1', '2026-07-01', '2026-07-05', 'Holiday')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_time_off').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', start_date: '2026-07-01', end_date: '2026-07-05',
    reason: 'Holiday', status: 'pending', requested_by: 'c1', decided_by: null, decided_at: null,
  }))
})

test('requestTimeOff: manager on behalf auto-approves', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
      { data: { role: 'coach' }, error: null },
    ],
    coach_time_off: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await requestTimeOff('c1', '2026-07-01', '2026-07-05', '')
  expect(res.error).toBeNull()
  const insert = rls.builder('coach_time_off').insert.mock.calls[0][0]
  expect(insert.status).toBe('approved')
  expect(insert.decided_by).toBe('o1')
  expect(insert.reason).toBeNull()
})

test('requestTimeOff: invalid range rejected before guard', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await requestTimeOff('c1', '2026-07-05', '2026-07-01', '')).error).toMatch(/on or after/i)
})

test('requestTimeOff: coach cannot request for another coach', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await requestTimeOff('c2', '2026-07-01', '2026-07-05', '')).error).toMatch(/your own/i)
})

test('decideTimeOff: manager approves (box-scoped update)', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    coach_time_off: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await decideTimeOff('to1', 'approved')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_time_off').update).toHaveBeenCalledWith(expect.objectContaining({
    status: 'approved', decided_by: 'o1',
  }))
  expect(rls.builder('coach_time_off').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('decideTimeOff: coach denied (manager only)', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await decideTimeOff('to1', 'approved')).error).toMatch(/owners and admins/i)
})

test('decideTimeOff: invalid decision rejected', async () => {
  // guard not reached — validation first
  expect((await decideTimeOff('to1', 'maybe' as 'approved')).error).toMatch(/invalid/i)
})

test('cancelTimeOff: coach cancels own pending', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_time_off: [{ data: { coach_id: 'c1', status: 'pending' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await cancelTimeOff('to1')).error).toBeNull()
  expect(rls.builder('coach_time_off').delete).toHaveBeenCalled()
})

test('cancelTimeOff: coach cannot cancel approved own request', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_time_off: { data: { coach_id: 'c1', status: 'approved' }, error: null },
  } }))
  expect((await cancelTimeOff('to1')).error).toMatch(/pending/i)
})

test('cancelTimeOff: manager deletes any', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    coach_time_off: [{ data: { coach_id: 'c1', status: 'approved' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await cancelTimeOff('to1')).error).toBeNull()
  expect(rls.builder('coach_time_off').delete).toHaveBeenCalled()
})
