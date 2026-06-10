import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendMessage } from '@/app/dashboard/inbox/_actions/send-message'

beforeEach(() => vi.clearAllMocks())

function caller(role: string, userId: string) {
  return makeSupabaseMock({
    user: { id: userId },
    results: {
      profiles: { data: { box_id: 'b1', role }, error: null },
      conversations: { data: { id: 'cv1' }, error: null },
      messages: { data: null, error: null },
    },
  })
}

test('rejects when not authenticated', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  const res = await sendMessage('a1', 'hi')
  expect(res.error).toMatch(/auth/i)
})

test('rejects an empty body', async () => {
  serverCreate.mockResolvedValue(caller('coach', 's1'))
  const res = await sendMessage('a1', '   ')
  expect(res.error).toMatch(/empty/i)
})

test('staff message sets member_unread and sender_role staff', async () => {
  const rls = caller('coach', 's1')
  serverCreate.mockResolvedValue(rls)
  const res = await sendMessage('a1', 'See you at 6am')
  expect(res.error).toBeNull()
  expect(res.conversationId).toBe('cv1')
  const up = rls.builder('conversations').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ box_id: 'b1', member_id: 'a1', last_sender_role: 'staff', member_unread: true, staff_unread: false }))
  const msg = rls.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ conversation_id: 'cv1', sender_id: 's1', sender_role: 'staff', body: 'See you at 6am' }))
})

test('member message sets staff_unread, forced to own member_id', async () => {
  const rls = caller('athlete', 'a9')
  serverCreate.mockResolvedValue(rls)
  // even if a different memberId is passed, an athlete targets their own thread
  const res = await sendMessage('someoneElse', 'is the 6am on?')
  expect(res.error).toBeNull()
  const up = rls.builder('conversations').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ member_id: 'a9', last_sender_role: 'member', staff_unread: true, member_unread: false }))
  const msg = rls.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ sender_role: 'member', sender_id: 'a9' }))
})
