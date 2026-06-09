import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, emailMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  emailMock: vi.fn(() => Promise.resolve({ ok: true, error: null })),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendBroadcast } from '@/app/dashboard/broadcasts/_actions/send-broadcast'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

// Service mock with one emailable member (profiles row carries BOTH member fields
// and unsubscribe_token, since the action queries profiles twice).
function service(profilesData: unknown[]) {
  return makeSupabaseMock({
    results: {
      profiles: { data: profilesData, error: null },
      memberships: { data: [], error: null },
      member_tags: { data: [], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      broadcasts: { data: { id: 'bc1' }, error: null },
    },
  })
}

test('non-owner is rejected and nothing is sent', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await sendBroadcast('Hi', 'Body', 'all', null)
  expect(res.error).toMatch(/owner/i)
  expect(serviceCreate).not.toHaveBeenCalled()
  expect(emailMock).not.toHaveBeenCalled()
})

test('invalid input returns a validation error before any send', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await sendBroadcast('   ', 'Body', 'all', null)
  expect(res.error).toMatch(/subject/i)
  expect(emailMock).not.toHaveBeenCalled()
})

test('happy path creates a broadcast, queues the recipient, and sends', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, unsubscribe_token: 'tok1' }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendBroadcast('Hi', 'Hello {{first_name}}', 'all', null)

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  expect(res.skipped).toBe(0)
  const bcInsert = svc.builder('broadcasts').insert.mock.calls[0][0]
  expect(bcInsert).toEqual(expect.objectContaining({ box_id: 'b1', recipient_count: 1, skipped_count: 0 }))
  const recInsert = svc.builder('broadcast_recipients').insert.mock.calls[0][0]
  expect(recInsert).toEqual(expect.arrayContaining([expect.objectContaining({ athlete_id: 'a1', status: 'queued' })]))
  expect(emailMock).toHaveBeenCalledTimes(1)
  expect(emailMock.mock.calls[0][0]).toHaveLength(1)
})

test('opted-out member is skipped, not emailed', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: true, unsubscribe_token: 'tok1' }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendBroadcast('Hi', 'Hello', 'all', null)

  expect(res.skipped).toBe(1)
  expect(res.sent).toBe(0)
  expect(emailMock).not.toHaveBeenCalled()
  const recInsert = svc.builder('broadcast_recipients').insert.mock.calls[0][0]
  expect(recInsert).toEqual(expect.arrayContaining([expect.objectContaining({ athlete_id: 'a1', status: 'skipped' })]))
})
