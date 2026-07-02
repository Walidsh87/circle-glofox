import { test, expect, vi } from 'vitest'
import { makeSupabaseMock, type MockResult } from './helpers/supabase-mock'
import { ensureReferralViaApi } from '@/lib/api/referral-core'

const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/

function svc(results: Record<string, MockResult | MockResult[]>) {
  return makeSupabaseMock({ results })
}

test('existing code → returned as-is, no mint attempted, link + counts included', async () => {
  const m = svc({
    // 1st profiles hit: own row read; 2nd: joined count
    profiles: [{ data: { referral_code: 'ABC2345' }, error: null }, { data: null, error: null, count: 3 }],
    boxes: { data: { slug: 'functional-fitness' }, error: null },
    leads: { data: null, error: null, count: 2 },
  })
  const res = await ensureReferralViaApi(m as never, 'a1', 'b1', 'https://app.test')
  expect(res).toEqual({
    ok: true,
    referralCode: 'ABC2345',
    link: 'https://app.test/embed/lead/functional-fitness?ref=ABC2345',
    referred: 2,
    joined: 3,
  })
  expect(m.builder('profiles')!.update).not.toHaveBeenCalled()
})

test('null code → mints a 7-char unambiguous code with the atomic null-guard', async () => {
  const m = svc({
    // read (null) → update chain (1 row) → joined count
    profiles: [
      { data: { referral_code: null }, error: null },
      { data: [{ referral_code: 'X' }], error: null },
      { data: null, error: null, count: 0 },
    ],
    boxes: { data: { slug: 'functional-fitness' }, error: null },
    leads: { data: null, error: null, count: 0 },
  })
  const res = await ensureReferralViaApi(m as never, 'a1', 'b1', 'https://app.test')
  expect(res.ok).toBe(true)
  if (res.ok) {
    expect(res.referralCode).toMatch(CODE_RE)
    expect(res.link).toBe(`https://app.test/embed/lead/functional-fitness?ref=${res.referralCode}`)
  }
  const b = m.builder('profiles')!
  expect(b.update).toHaveBeenCalledWith({ referral_code: expect.stringMatching(CODE_RE) })
  expect(b.is).toHaveBeenCalledWith('referral_code', null)
})

test('concurrent mint (0 rows updated) → returns the STORED code, not the dead candidate', async () => {
  const m = svc({
    // read (null) → update chain (0 rows) → re-read (stored) → joined count
    profiles: [
      { data: { referral_code: null }, error: null },
      { data: [], error: null },
      { data: { referral_code: 'STORED77' }, error: null },
      { data: null, error: null, count: 1 },
    ],
    boxes: { data: { slug: 'functional-fitness' }, error: null },
    leads: { data: null, error: null, count: 1 },
  })
  const res = await ensureReferralViaApi(m as never, 'a1', 'b1', 'https://app.test')
  expect(res).toMatchObject({ ok: true, referralCode: 'STORED77' })
})

test('no gym slug → link is null (code + counts still returned)', async () => {
  const m = svc({
    profiles: [{ data: { referral_code: 'ABC2345' }, error: null }, { data: null, error: null, count: 0 }],
    boxes: { data: { slug: null }, error: null },
    leads: { data: null, error: null, count: 0 },
  })
  const res = await ensureReferralViaApi(m as never, 'a1', 'b1', 'https://app.test')
  expect(res).toMatchObject({ ok: true, referralCode: 'ABC2345', link: null })
})

test('missing profile → not_found', async () => {
  const m = svc({ profiles: { data: null, error: null } })
  const res = await ensureReferralViaApi(m as never, 'a1', 'b1', 'https://app.test')
  expect(res).toEqual({ ok: false, code: 'not_found', message: 'Profile not found.' })
})

test('persistent unique-collision on mint → internal after 3 attempts', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const m = svc({
    // read (null) → every update errors (last entry sticks for all 3 attempts)
    profiles: [
      { data: { referral_code: null }, error: null },
      { data: null, error: { message: 'duplicate key' } },
    ],
  })
  const res = await ensureReferralViaApi(m as never, 'a1', 'b1', 'https://app.test')
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.stringMatching(/could not generate/i) })
})
