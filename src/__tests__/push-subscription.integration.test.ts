import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { savePushSubscription, deletePushSubscription } from '@/app/dashboard/schedule/_actions/push-subscription'

beforeEach(() => vi.clearAllMocks())

function caller() {
  return makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1' }, error: null } } })
}

test('save rejects an unauthenticated caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await savePushSubscription('https://p/1', 'k', 'a')
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('save rejects a non-https endpoint before touching the database', async () => {
  serverCreate.mockResolvedValue(caller())
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await savePushSubscription('http://insecure/1', 'k', 'a')
  expect(res.error).toBe('Invalid subscription.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('save upserts pinned to the caller with endpoint conflict handling', async () => {
  serverCreate.mockResolvedValue(caller())
  const svc = makeSupabaseMock({ results: { push_subscriptions: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await savePushSubscription('https://p/1', 'k1', 'au1')
  expect(res.error).toBeNull()
  expect(svc.builder('push_subscriptions').upsert).toHaveBeenCalledWith(
    { box_id: 'b1', athlete_id: 'a1', endpoint: 'https://p/1', p256dh: 'k1', auth: 'au1' },
    { onConflict: 'endpoint' },
  )
})

test('delete is scoped to the caller’s own endpoint', async () => {
  serverCreate.mockResolvedValue(caller())
  const svc = makeSupabaseMock({ results: { push_subscriptions: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await deletePushSubscription('https://p/1')
  expect(res.error).toBeNull()
  expect(svc.builder('push_subscriptions').delete).toHaveBeenCalled()
  expect(svc.builder('push_subscriptions').eq).toHaveBeenCalledWith('endpoint', 'https://p/1')
  expect(svc.builder('push_subscriptions').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})
