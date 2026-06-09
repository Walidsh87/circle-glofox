import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { freezeMembership, resumeMembership } from '@/app/dashboard/payments/_actions/freeze-membership'
import { scheduleCancellation, undoScheduledCancellation } from '@/app/dashboard/payments/_actions/schedule-cancellation'

beforeEach(() => vi.clearAllMocks())

function owner() {
  return makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, memberships: { data: null, error: null } },
  })
}
function coach() {
  return makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  })
}

test('freezeMembership writes both columns, scoped by id + box', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await freezeMembership('m1', '2026-07-01', '2026-08-01')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ frozen_from: '2026-07-01', frozen_until: '2026-08-01' })
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('id', 'm1')
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('freezeMembership rejects an until <= from', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await freezeMembership('m1', '2026-08-01', '2026-08-01')
  expect(res.error).toMatch(/after the freeze start/i)
})

test('resumeMembership clears both columns', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await resumeMembership('m1')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ frozen_from: null, frozen_until: null })
})

test('scheduleCancellation sets a future end_date', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await scheduleCancellation('m1', '2030-01-01')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ end_date: '2030-01-01' })
})

test('scheduleCancellation rejects a past date', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await scheduleCancellation('m1', '2000-01-01')
  expect(res.error).toMatch(/today or later/i)
})

test('undoScheduledCancellation clears end_date', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await undoScheduledCancellation('m1')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ end_date: null })
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(coach())
  expect((await freezeMembership('m1', '2026-07-01', null)).error).toMatch(/owners/i)
  expect((await scheduleCancellation('m1', '2030-01-01')).error).toMatch(/owners/i)
})
