import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, emailMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  emailMock: vi.fn(() => Promise.resolve({ ok: true, error: null, ids: ['re_1'] })),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { retryFailedBroadcast } from '@/app/dashboard/broadcasts/_actions/retry-failed'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await retryFailedBroadcast('bc1')
  expect(res.error).toMatch(/owner/i)
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('re-sends failed recipients and updates the broadcast', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = makeSupabaseMock({
    results: {
      broadcasts: { data: { id: 'bc1', box_id: 'b1', subject: 'Hi', body: 'Hello {{first_name}}' }, error: null },
      broadcast_recipients: { data: [{ athlete_id: 'a1', email: 's@x.com' }], error: null, count: 1 },
      profiles: { data: [{ id: 'a1', full_name: 'Sarah Lee', unsubscribe_token: 'tok1' }], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await retryFailedBroadcast('bc1')

  expect(res.error).toBeNull()
  expect(emailMock).toHaveBeenCalledTimes(1)
  expect(svc.builder('broadcasts').update).toHaveBeenCalled()
})

test('a broadcast from another box is not found', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = makeSupabaseMock({ results: { broadcasts: { data: { id: 'bc1', box_id: 'OTHER', subject: 'Hi', body: 'x' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await retryFailedBroadcast('bc1')
  expect(res.error).toMatch(/not found/i)
  expect(emailMock).not.toHaveBeenCalled()
})
