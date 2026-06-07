import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { redeemSession } from '@/app/dashboard/members/[memberId]/_actions/redeem-session'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-owner (coach) — never touches the service role', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { role: 'coach', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1')
  expect(res.error).toBe('Only owners can redeem sessions.')
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('rejects a batch not found in the owner box / wrong kind — no consume', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: { package_credits: { data: null, error: null } }, // box/kind-scoped read misses
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1')
  expect(res.error).toBe('PT credit batch not found.')
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('owner redeems one session from a PT batch in their box', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: {
      package_credits: { data: { id: 'batch-1', athlete_id: 'm1', kind: 'pt_session', credits_remaining: 3 }, error: null },
    },
    rpc: { data: 2, error: null }, // consume_credit → 2 remaining
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'batch-1' })
})
