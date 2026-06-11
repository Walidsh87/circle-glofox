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

test('rejects a missing coach pick before auth — never touches the service role', async () => {
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', '')
  expect(res.error).toBe('Pick the coach who delivered the session.')
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('rejects a non-owner (coach) — never touches the service role', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { role: 'coach', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', 'coach-1')
  expect(res.error).toBe('Only owners can redeem sessions.')
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('rejects a coach not in the owner box — no consume', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: { profiles: { data: null, error: null } }, // coach lookup misses
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', 'intruder')
  expect(res.error).toBe('Coach not found in your gym.')
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('rejects a batch not found in the owner box / wrong kind — no consume, no log', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'coach-1', role: 'coach' }, error: null },
      package_credits: { data: null, error: null }, // box/kind-scoped read misses
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', 'coach-1')
  expect(res.error).toBe('PT credit batch not found.')
  expect(svc.rpc).not.toHaveBeenCalled()
  expect(svc.builder('pt_sessions')).toBeUndefined()
})

test('owner redeems one session from a PT batch in their box', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'coach-1', role: 'coach' }, error: null },
      package_credits: { data: { id: 'batch-1', athlete_id: 'm1', kind: 'pt_session', credits_remaining: 3 }, error: null },
      pt_sessions: { data: null, error: null },
    },
    rpc: { data: 2, error: null }, // consume_credit → 2 remaining
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', 'coach-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'batch-1' })
})

test('logs a pt_session row after successful consumption', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'coach-1', role: 'coach' }, error: null },
      package_credits: { data: { id: 'batch-1', athlete_id: 'a1', kind: 'pt_session', credits_remaining: 3 }, error: null },
      pt_sessions: { data: null, error: null },
    },
    rpc: { data: 2, error: null },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', 'coach-1')
  expect(res.error).toBeNull()
  const ins = svc.builder('pt_sessions').insert.mock.calls[0][0]
  expect(ins).toMatchObject({ box_id: 'b1', coach_id: 'coach-1', athlete_id: 'a1', credit_id: 'batch-1', redeemed_by: 'owner1' })
})

test('does not log a pt_session when consumption fails', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'coach-1', role: 'coach' }, error: null },
      package_credits: { data: { id: 'batch-1', athlete_id: 'a1', kind: 'pt_session', credits_remaining: 3 }, error: null },
    },
    rpc: { data: null, error: { message: 'no credits' } },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await redeemSession('batch-1', 'coach-1')
  expect(res.error).toBe('Could not redeem a session. Please try again.')
  expect(svc.builder('pt_sessions')).toBeUndefined()
})
