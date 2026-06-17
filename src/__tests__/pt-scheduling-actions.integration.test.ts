import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { schedulePtSession } from '@/app/dashboard/members/[memberId]/_actions/schedule-pt-session'
import { cancelPtSession } from '@/app/dashboard/members/[memberId]/_actions/cancel-pt-session'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

// A staff session for the guard (server client).
function staff(role = 'owner') {
  return makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role, full_name: 'O' }, error: null } } })
}

test('schedulePtSession: invalid duration rejected before the guard', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 10)
  expect(res.error).toMatch(/duration/i)
})

test('schedulePtSession: athlete (non-staff) denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toMatch(/staff/i)
})

test('schedulePtSession: blocks when the coach is on approved leave', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }], // coach, athlete
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [{ coach_id: 'c1', start_date: '2026-07-01', end_date: '2026-07-01' }], error: null },
  } }))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toMatch(/leave/i)
})

test('schedulePtSession: blocks on an overlapping PT session', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: { data: [{ scheduled_at: '2026-07-01T06:30:00+04:00', duration_minutes: 60 }], error: null },
  } }))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60) // 06:00-07:00 vs 06:30-07:30
  expect(res.error).toMatch(/already has a PT session/i)
})

test('schedulePtSession: soft-warns outside availability (no force, no write)', async () => {
  const svc = makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: { data: [], error: null },
    class_instances: { data: [], error: null },
    coach_availability: { data: [], error: null }, // no windows → not within
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toBeNull()
  expect(res.warning).toMatch(/usually available/i)
  expect(svc.rpc).not.toHaveBeenCalled() // no credit consumed
})

test('schedulePtSession: force schedules — consume then insert', async () => {
  const svc = makeSupabaseMock({ user: { id: 'u1' }, rpc: { data: 4, error: null }, results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: [{ data: [], error: null }, { data: null, error: null }], // overlap select, then insert
    class_instances: { data: [], error: null },
    coach_availability: { data: [], error: null },
    package_credits: { data: [{ id: 'cr1', credits_remaining: 3, expires_at: null }], error: null },
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60, true)
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'cr1' })
  expect(svc.builder('pt_sessions').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', athlete_id: 'a1', credit_id: 'cr1', duration_minutes: 60, status: 'scheduled', redeemed_by: 'u1',
  }))
})

test('schedulePtSession: insert failure refunds the consumed credit', async () => {
  const svc = makeSupabaseMock({ user: { id: 'u1' }, rpc: { data: 4, error: null }, results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: [{ data: [], error: null }, { data: null, error: { message: 'boom' } }], // overlap select, then failing insert
    class_instances: { data: [], error: null },
    coach_availability: { data: [], error: null },
    package_credits: { data: [{ id: 'cr1', credits_remaining: 3, expires_at: null }], error: null },
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60, true)
  expect(res.error).toMatch(/could not schedule/i)
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'cr1' })
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'cr1' })
})

test('schedulePtSession: no PT credits → refuse', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: { data: [], error: null },
    class_instances: { data: [], error: null },
    coach_availability: { data: [{ weekday: 3, start_time: '06:00:00', end_time: '10:00:00' }], error: null },
    package_credits: { data: [], error: null },
  } }))
  // 2026-07-01 is a Wednesday (getUTCDay = 3) → within availability, no warning; then no credit.
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toMatch(/no pt credits/i)
})

test('cancelPtSession: refunds + flips status', async () => {
  const svc = makeSupabaseMock({ rpc: { data: 4, error: null }, results: {
    pt_sessions: [{ data: { athlete_id: 'a1', credit_id: 'cr1', status: 'scheduled' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await cancelPtSession('s1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'cr1' })
  expect(svc.builder('pt_sessions').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
})

test('cancelPtSession: already cancelled → no-op error', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    pt_sessions: { data: { athlete_id: 'a1', credit_id: 'cr1', status: 'cancelled' }, error: null },
  } }))
  expect((await cancelPtSession('s1')).error).toMatch(/already cancelled/i)
})

test('cancelPtSession: refund failure aborts without cancelling', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ rpc: { data: null, error: { message: 'boom' } }, results: {
    pt_sessions: { data: { athlete_id: 'a1', credit_id: 'cr1', status: 'scheduled' }, error: null },
  } }))
  const res = await cancelPtSession('s1')
  expect(res.error).toMatch(/refund|try again/i)
})

test('cancelPtSession: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  expect((await cancelPtSession('s1')).error).toMatch(/staff/i)
})
