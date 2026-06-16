import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))

import { loadMemberContext } from '@/app/dashboard/desk/_actions/load-member-context'

beforeEach(() => vi.clearAllMocks())

test('blocks non-staff', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  expect((await loadMemberContext('a1')).error).toMatch(/staff/i)
})

test('returns membership + mapped today bookings for staff', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  const svc = makeSupabaseMock({ results: {
    memberships: { data: [{ id: 'm1', plan_name: 'Unlimited', monthly_price_aed: 300, payment_status: 'paid', provider_plan_ref: null, start_date: '2026-06-01' }], error: null },
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    bookings: { data: [{ id: 'bk1', checked_in: false, class_instances: { id: 'ci1', starts_at: '2026-06-16T18:00:00+04:00', class_templates: { name: 'CrossFit' } } }], error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await loadMemberContext('a1')
  expect(res.error).toBeNull()
  expect(res.ctx!.membership!.id).toBe('m1')
  expect(res.ctx!.todayBookings).toEqual([{ bookingId: 'bk1', instanceId: 'ci1', className: 'CrossFit', startsAt: '2026-06-16T18:00:00+04:00', checkedIn: false }])
})
