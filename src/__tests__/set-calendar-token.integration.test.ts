import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setCalendarToken } from '@/app/dashboard/schedule/_actions/set-calendar-token'

beforeEach(() => vi.clearAllMocks())

test('rejects an unauthenticated caller and never touches the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await setCalendarToken('generate')
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('generate writes a uuid calendar_token pinned to the caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCalendarToken('generate')
  expect(res.error).toBeNull()
  const arg = svc.builder('profiles').update.mock.calls[0][0]
  expect(arg.calendar_token).toMatch(/^[0-9a-f-]{36}$/)
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'a1')
})

test('disable nulls the calendar_token, own row only', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCalendarToken('disable')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update.mock.calls[0][0]).toEqual({ calendar_token: null })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'a1')
})
