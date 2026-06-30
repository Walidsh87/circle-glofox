import { test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { cancelViaApi } from '@/lib/api/cancel-core'

const NOW = '2026-06-20T08:00:00Z'
const FUTURE = '2026-06-25T18:00:00Z'
const SOON = '2026-06-20T10:00:00Z' // 2h after NOW

// bookings is hit twice: [0] credit_id read (maybeSingle), [1] delete (await).
function svc(over: { bookings?: { data: unknown; error: unknown }[]; instance?: unknown; rpc?: { data: unknown; error: unknown } } = {}) {
  return makeSupabaseMock({
    results: {
      bookings: over.bookings ?? [{ data: { credit_id: 'batch1' }, error: null }, { data: null, error: null }],
      class_instances: { data: 'instance' in over ? over.instance : { starts_at: FUTURE, boxes: { late_cancel_hours: 0 } }, error: null },
    },
    rpc: over.rpc ?? { data: 1, error: null },
  })
}
const args = { boxId: 'b1', athleteId: 'a1', instanceId: 'c1', nowIso: NOW }

test('credit-backed normal cancel → deletes, refunds the credit, not forfeited', async () => {
  const s = svc()
  const res = await cancelViaApi(s as never, args)
  expect(res).toEqual({ ok: true, forfeited: false })
  expect(s.builder('bookings').delete).toHaveBeenCalled()
  expect(s.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch1' })
})

test('late cancel → forfeited, credit NOT refunded', async () => {
  const s = svc({ instance: { starts_at: SOON, boxes: { late_cancel_hours: 24 } } })
  const res = await cancelViaApi(s as never, args)
  expect(res).toEqual({ ok: true, forfeited: true })
  expect(s.builder('bookings').delete).toHaveBeenCalled()
  expect(s.rpc).not.toHaveBeenCalled()
})

test('no credit-backed booking → cancels, no refund, not forfeited', async () => {
  const s = svc({ bookings: [{ data: { credit_id: null }, error: null }, { data: null, error: null }] })
  const res = await cancelViaApi(s as never, args)
  expect(res).toEqual({ ok: true, forfeited: false })
  expect(s.rpc).not.toHaveBeenCalled()
})

test('no booking row → not_found, nothing deleted', async () => {
  const s = svc({ bookings: [{ data: null, error: null }] })
  const res = await cancelViaApi(s as never, args)
  expect(res).toEqual({ ok: false, code: 'not_found', message: expect.any(String) })
  expect(s.builder('bookings').delete).not.toHaveBeenCalled()
})
