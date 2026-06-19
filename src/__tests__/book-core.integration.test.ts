import { test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { bookViaApi } from '@/lib/api/book-core'

const NOW = '2026-06-20T08:00:00Z'
const FUTURE = '2026-06-20T18:00:00Z'

function svc(over: {
  instance?: unknown
  profile?: unknown
  memberships?: unknown[]
  credits?: unknown[]
  bookings?: { data: unknown; error: unknown; count?: number }[]
  rpc?: { data: unknown; error: unknown }
} = {}) {
  return makeSupabaseMock({
    results: {
      class_instances: { data: 'instance' in over ? over.instance : { id: 'c1', capacity: 10, box_id: 'b1', starts_at: FUTURE, boxes: { booking_close_minutes: 0 } }, error: null },
      profiles: { data: 'profile' in over ? over.profile : { id: 'a1', household_id: null }, error: null },
      households: { data: { primary_athlete_id: 'primary1' }, error: null },
      memberships: { data: over.memberships ?? [], error: null },
      package_credits: { data: over.credits ?? [], error: null },
      bookings: over.bookings ?? [{ data: null, error: null, count: 0 }, { data: { id: 'bk1' }, error: null }],
    },
    rpc: over.rpc ?? { data: null, error: null },
  })
}
const args = { boxId: 'b1', athleteId: 'a1', instanceId: 'c1', nowIso: NOW }

test('no membership + no credits → needs_entitlement, no insert', async () => {
  const s = svc()
  const res = await bookViaApi(s as never, args)
  expect(res).toEqual({ ok: false, code: 'needs_entitlement', message: expect.any(String) })
  expect(s.builder('bookings').insert).not.toHaveBeenCalled()
})

test('paid membership → books free (no credit consumed), returns bookingId', async () => {
  const s = svc({ memberships: [{ payment_status: 'paid', end_date: null }] })
  const res = await bookViaApi(s as never, args)
  expect(res).toEqual({ ok: true, bookingId: 'bk1' })
  expect(s.rpc).not.toHaveBeenCalled()
  expect(s.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', class_instance_id: 'c1' }))
  expect(s.builder('bookings').insert.mock.calls[0][0]).not.toHaveProperty('credit_id')
})

test('a class credit → consume one, book linked to it', async () => {
  const s = svc({ credits: [{ id: 'batch-1', credits_remaining: 5, expires_at: null }], rpc: { data: 4, error: null } })
  const res = await bookViaApi(s as never, args)
  expect(res).toEqual({ ok: true, bookingId: 'bk1' })
  expect(s.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'batch-1' })
  expect(s.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ credit_id: 'batch-1' }))
})

test('credit consumed but insert fails → refunds (exactly one consume + one refund), conflict', async () => {
  const s = svc({
    credits: [{ id: 'batch-1', credits_remaining: 5, expires_at: null }],
    rpc: { data: 4, error: null },
    bookings: [{ data: null, error: null, count: 0 }, { data: null, error: { code: '23505', message: 'dup' } }],
  })
  const res = await bookViaApi(s as never, args)
  expect(res).toMatchObject({ ok: false, code: 'conflict' })
  expect(s.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
  expect(s.rpc).toHaveBeenCalledTimes(2)
})

test('membership resolved through the household primary for a dependent', async () => {
  const s = svc({ profile: { id: 'a1', household_id: 'hh1' }, memberships: [{ payment_status: 'paid', end_date: null }] })
  const res = await bookViaApi(s as never, args)
  expect(res).toEqual({ ok: true, bookingId: 'bk1' })
  expect(s.builder('memberships').eq).toHaveBeenCalledWith('athlete_id', 'primary1')
  expect(s.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'a1' }))
})

test('class full → full', async () => {
  const s = svc({ memberships: [{ payment_status: 'paid', end_date: null }], bookings: [{ data: null, error: null, count: 10 }] })
  expect(await bookViaApi(s as never, args)).toMatchObject({ ok: false, code: 'full' })
})

test('inside the close window → closed', async () => {
  const near = '2026-06-20T08:10:00Z' // 10 min away
  const s = svc({ instance: { id: 'c1', capacity: 10, box_id: 'b1', starts_at: near, boxes: { booking_close_minutes: 30 } } })
  expect(await bookViaApi(s as never, args)).toMatchObject({ ok: false, code: 'closed' })
})

test('unknown class / cross-box class → not_found; box-scoped query', async () => {
  const s = svc({ instance: null })
  expect(await bookViaApi(s as never, args)).toMatchObject({ ok: false, code: 'not_found' })
  expect(s.builder('class_instances').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('member not in box → not_found', async () => {
  const s = svc({ profile: null, memberships: [{ payment_status: 'paid', end_date: null }] })
  expect(await bookViaApi(s as never, args)).toMatchObject({ ok: false, code: 'not_found' })
})
