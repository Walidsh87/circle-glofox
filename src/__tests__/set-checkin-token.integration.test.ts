import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setCheckinToken } from '@/app/dashboard/settings/_actions/set-checkin-token'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-owner (coach) and never touches the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await setCheckinToken('generate')
  expect(res.error).toMatch(/only owners/i)
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('generate writes a uuid checkin_token to the caller box', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCheckinToken('generate')
  expect(res.error).toBeNull()
  const arg = svc.builder('boxes').update.mock.calls[0][0]
  expect(arg.checkin_token).toMatch(/^[0-9a-f-]{36}$/)
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})

test('disable nulls the checkin_token, box-scoped', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCheckinToken('disable')
  expect(res.error).toBeNull()
  expect(svc.builder('boxes').update.mock.calls[0][0]).toEqual({ checkin_token: null })
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})
