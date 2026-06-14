import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, pushSpy } = vi.hoisted(() => ({
  serverCreate: vi.fn(), serviceCreate: vi.fn(), pushSpy: vi.fn(async () => 1),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/twilio', () => ({ sendWhatsAppText: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushTo: pushSpy }))

import { sendMessage } from '@/app/dashboard/inbox/_actions/send-message'

beforeEach(() => vi.clearAllMocks())

test('a staff reply pushes to the member', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner' }, error: null }, // caller lookup
      { data: { id: 'm1' }, error: null },                     // box-membership guard
      { data: { language: null }, error: null },               // recipient language
    ],
    conversations: [
      { data: { last_wa_inbound_at: null }, error: null }, // session-window lookup
      { data: { id: 'conv1' }, error: null },              // upsert
    ],
    messages: { data: null, error: null },
  } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await sendMessage('m1', 'See you at 7am!')
  expect(res.error).toBeNull()
  expect(pushSpy).toHaveBeenCalledWith(expect.anything(), 'm1', 'b1', expect.objectContaining({
    url: '/dashboard/messages',
  }))
})

test('a member send does not push', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null },
    conversations: { data: { id: 'conv1' }, error: null }, // upsert only (member skips the WA lookup)
    messages: { data: null, error: null },
  } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await sendMessage('', 'Can I switch to the 6pm class?')
  expect(res.error).toBeNull()
  expect(pushSpy).not.toHaveBeenCalled()
})
