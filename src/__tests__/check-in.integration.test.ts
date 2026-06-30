import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { checkIn } from '@/app/dashboard/whiteboard/_actions/check-in'

beforeEach(() => vi.clearAllMocks())

// Staff coach in box b1 (the RLS client). Memberships are read via the SERVICE client (mig 090
// tightened memberships to self-or-staff) — so they're configured on svc(), not here.
function staffRls(extraProfile: Record<string, unknown> = {}) {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', ...extraProfile }, error: null },
      households: { data: { primary_athlete_id: 'primary1' }, error: null },
    },
  })
}
// Service client: the entitlement gate's memberships read + the booking credit lookup + the update.
function svc(memberships: unknown[], booking: { credit_id: string | null } | null) {
  return makeSupabaseMock({
    results: {
      memberships: { data: memberships, error: null },
      bookings: { data: booking, error: null },
    },
  })
}

test('blocks an unpaid athlete with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(staffRls())
  serviceCreate.mockReturnValue(svc([], { credit_id: null }))

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('no_membership')
})

test('allows a no-membership athlete whose booking is credit-backed', async () => {
  serverCreate.mockResolvedValue(staffRls())
  const s = svc([], { credit_id: 'batch-1' })
  serviceCreate.mockReturnValue(s)

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBeNull()
  expect(s.builder('bookings').update).toHaveBeenCalledWith(
    expect.objectContaining({ checked_in: true }),
  )
})

test('blocks a frozen athlete with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(staffRls())
  serviceCreate.mockReturnValue(svc([{ payment_status: 'paid', end_date: null, last_paid_date: null, frozen_from: '2026-01-01', frozen_until: null }], { credit_id: null }))

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('frozen')
})

test('a dependent checks in via the household primary’s paid membership', async () => {
  serverCreate.mockResolvedValue(staffRls({ household_id: 'hh1' }))
  const s = svc([{ payment_status: 'paid', end_date: null }], { credit_id: null })
  serviceCreate.mockReturnValue(s)

  const res = await checkIn('class-1', 'dependent1')
  expect(res.error).toBeNull()
  expect(s.builder('memberships').eq).toHaveBeenCalledWith('athlete_id', 'primary1') // resolved to the primary
})

test('a dependent is blocked when the primary is unpaid and there is no credit', async () => {
  serverCreate.mockResolvedValue(staffRls({ household_id: 'hh1' }))
  serviceCreate.mockReturnValue(svc([{ payment_status: 'unpaid', end_date: null }], { credit_id: null }))

  const res = await checkIn('class-1', 'dependent1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('unpaid')
})

test('allows an athlete with an active-but-unpaid membership when the booking is credit-backed', async () => {
  // 'unpaid' (active row, not paid) and 'no_membership' share the credit fall-through path.
  serverCreate.mockResolvedValue(staffRls())
  const s = svc([{ payment_status: 'unpaid', end_date: null, last_paid_date: null }], { credit_id: 'batch-1' })
  serviceCreate.mockReturnValue(s)

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBeNull()
  expect(s.builder('bookings').update).toHaveBeenCalledWith(
    expect.objectContaining({ checked_in: true }),
  )
})
