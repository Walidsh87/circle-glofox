import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requestProgram } from '@/app/dashboard/members/[memberId]/_actions/request-program'

beforeEach(() => vi.clearAllMocks())

const athlete = () => makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { role: 'athlete', box_id: 'b1' }, error: null } } })

test('rejects an unknown focus', async () => {
  serverCreate.mockResolvedValue(athlete())
  expect((await requestProgram('Become a wizard', '')).error).toMatch(/focus/i)
})

test('a non-athlete (coach) cannot request a program', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { role: 'coach', box_id: 'b1' }, error: null } } }))
  expect((await requestProgram('Strength', '')).error).toMatch(/member/i)
})

test('blocks a duplicate pending request', async () => {
  serverCreate.mockResolvedValue(athlete())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { follow_up_tasks: { data: [{ title: 'Program request: Strength' }], error: null } } }))
  expect((await requestProgram('Strength', '')).error).toMatch(/pending/i)
})

test('creates a member-linked, box-pinned task via the service client', async () => {
  serverCreate.mockResolvedValue(athlete())
  const svc = makeSupabaseMock({ results: { follow_up_tasks: [{ data: [], error: null }, { data: null, error: null }] } })
  serviceCreate.mockReturnValue(svc)
  const res = await requestProgram('Strength', 'mornings only')
  expect(res.error).toBeNull()
  expect(svc.builder('follow_up_tasks').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', member_id: 'a1', created_by: 'a1', done: false, title: 'Program request: Strength — mornings only' }),
  )
})
