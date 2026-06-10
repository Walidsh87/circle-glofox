import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { ensureReferralCode } from '@/app/dashboard/referrals/_actions/ensure-referral-code'
import { markReferralRewarded } from '@/app/dashboard/referrals/_actions/mark-rewarded'

beforeEach(() => vi.clearAllMocks())

test('ensureReferralCode returns an existing code without writing', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: { referral_code: 'EXIST22', box_id: 'b1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await ensureReferralCode()
  expect(res.code).toBe('EXIST22')
  expect(svc.builder('profiles').update).not.toHaveBeenCalled()
})

test('ensureReferralCode generates and persists when absent', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: { referral_code: null, box_id: 'b1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await ensureReferralCode()
  expect(res.error).toBeNull()
  expect(res.code).toMatch(/^[A-Z2-9]{7}$/)
  const upd = svc.builder('profiles').update.mock.calls[0][0]
  expect(upd.referral_code).toBe(res.code)
})

test('markReferralRewarded rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await markReferralRewarded('m1')
  expect(res.error).toMatch(/owner/i)
})

test('markReferralRewarded sets the timestamp, box-scoped', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await markReferralRewarded('m1')
  expect(res.error).toBeNull()
  const upd = rls.builder('profiles').update.mock.calls[0][0]
  expect(upd.referral_rewarded_at).toBeTruthy()
  expect(rls.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})
