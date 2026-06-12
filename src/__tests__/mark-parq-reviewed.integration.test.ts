import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markParqReviewed } from '@/app/dashboard/members/[memberId]/_actions/mark-parq-reviewed'

beforeEach(() => vi.clearAllMocks())

function staff(role = 'coach') {
  return makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null } } })
}

test('rejects a non-staff caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await markParqReviewed('a2')
  expect(res.error).toBe('Only staff can review PAR-Q responses.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('errors when the athlete has no response', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { parq_responses: { data: null, error: null } } }))
  const res = await markParqReviewed('a2')
  expect(res.error).toBe('Nothing to review.')
})

test('errors when the latest response has no YES', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { parq_responses: { data: { id: 'pr1', has_yes: false, reviewed_at: null }, error: null } } }))
  const res = await markParqReviewed('a2')
  expect(res.error).toBe('Nothing to review.')
})

test('errors when already reviewed', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { parq_responses: { data: { id: 'pr1', has_yes: true, reviewed_at: '2026-06-01T00:00:00Z' }, error: null } } }))
  const res = await markParqReviewed('a2')
  expect(res.error).toBe('Already reviewed.')
})

test('stamps reviewed_at/by box-scoped via the service client', async () => {
  serverCreate.mockResolvedValue(staff())
  const svc = makeSupabaseMock({ results: { parq_responses: [
    { data: { id: 'pr1', has_yes: true, reviewed_at: null }, error: null }, // latest lookup
    { data: null, error: null },                                            // update
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await markParqReviewed('a2')
  expect(res.error).toBeNull()
  expect(svc.builder('parq_responses').update).toHaveBeenCalledWith(expect.objectContaining({ reviewed_by: 's1' }))
  expect(svc.builder('parq_responses').eq).toHaveBeenCalledWith('box_id', 'b1')
})
