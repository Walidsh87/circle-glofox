import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Notify is gated on SUPABASE_SERVICE_ROLE_KEY (unset in tests) → no service client touched.

import { postSubRequest } from '@/app/dashboard/cover/_actions/post-sub-request'
import { cancelSubRequest } from '@/app/dashboard/cover/_actions/cancel-sub-request'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY // ensure notify no-ops
})

const FUTURE = '2099-07-01T06:00:00+04:00'
const PAST = '2000-01-01T06:00:00+04:00'

function staff(role = 'coach', id = 'c1') {
  return makeSupabaseMock({ user: { id }, results: { profiles: { data: { box_id: 'b1', role, full_name: 'Coach C' }, error: null } } })
}

test('postSubRequest: athlete denied', async () => {
  serverCreate.mockResolvedValue(staff('athlete', 'a1'))
  expect((await postSubRequest('i1', '')).error).toMatch(/coach|only/i)
})

test('postSubRequest: rejects a class that is not yours', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c2', starts_at: FUTURE, status: 'scheduled' }, error: null },
  } }))
  expect((await postSubRequest('i1', '')).error).toMatch(/your own/i)
})

test('postSubRequest: rejects a past class', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c1', starts_at: PAST, status: 'scheduled' }, error: null },
  } }))
  expect((await postSubRequest('i1', '')).error).toMatch(/already started/i)
})

test('postSubRequest: own future class → inserts open request', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c1', starts_at: FUTURE, status: 'scheduled' }, error: null },
    sub_requests: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await postSubRequest('i1', 'Away at a comp')
  expect(res.error).toBeNull()
  expect(rls.builder('sub_requests').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', instance_id: 'i1', posted_by: 'c1', note: 'Away at a comp', status: 'open',
  }))
})

test('postSubRequest: duplicate open → friendly message', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c1', starts_at: FUTURE, status: 'scheduled' }, error: null },
    sub_requests: { data: null, error: { code: '23505', message: 'dup' } },
  } }))
  expect((await postSubRequest('i1', '')).error).toMatch(/already posted/i)
})

test('cancelSubRequest: poster cancels own open request', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    sub_requests: [{ data: { posted_by: 'c1', status: 'open' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await cancelSubRequest('s1')).error).toBeNull()
  expect(rls.builder('sub_requests').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
})

test('cancelSubRequest: cannot cancel someone else’s request', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    sub_requests: { data: { posted_by: 'c2', status: 'open' }, error: null },
  } }))
  expect((await cancelSubRequest('s1')).error).toMatch(/your own/i)
})
