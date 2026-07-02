import { test, expect, vi } from 'vitest'
import { makeSupabaseMock, type MockResult } from './helpers/supabase-mock'
import { setCalendarTokenViaApi } from '@/lib/api/calendar-token-core'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function svc(results: Record<string, MockResult | MockResult[]>) {
  return makeSupabaseMock({ results })
}

test('generate → server-minted UUID token, row pinned to the caller', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  const res = await setCalendarTokenViaApi(m as never, 'a1', 'b1', 'generate')
  expect(res.ok).toBe(true)
  if (res.ok) expect(res.token).toMatch(UUID_RE)
  const b = m.builder('profiles')!
  expect(b.update).toHaveBeenCalledWith({ calendar_token: expect.stringMatching(UUID_RE) })
  expect(b.eq).toHaveBeenCalledWith('id', 'a1')
  expect(b.eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('generate twice → different tokens (regenerate rotates)', async () => {
  const m1 = svc({ profiles: { data: null, error: null } })
  const m2 = svc({ profiles: { data: null, error: null } })
  const r1 = await setCalendarTokenViaApi(m1 as never, 'a1', 'b1', 'generate')
  const r2 = await setCalendarTokenViaApi(m2 as never, 'a1', 'b1', 'generate')
  if (r1.ok && r2.ok) expect(r1.token).not.toBe(r2.token)
})

test('disable → token nulled', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  const res = await setCalendarTokenViaApi(m as never, 'a1', 'b1', 'disable')
  expect(res).toEqual({ ok: true, token: null })
  expect(m.builder('profiles')!.update).toHaveBeenCalledWith({ calendar_token: null })
})

test('a DB error → internal (not thrown)', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const m = svc({ profiles: { data: null, error: { message: 'boom' } } })
  const res = await setCalendarTokenViaApi(m as never, 'a1', 'b1', 'generate')
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
})
