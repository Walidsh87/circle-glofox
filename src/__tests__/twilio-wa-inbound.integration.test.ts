import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ verifyTwilioSignature: verifyMock }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/twilio-wa-inbound/route'

function reqWith(form: Record<string, string>) {
  return new Request('http://x/api/webhooks/twilio-wa-inbound', {
    method: 'POST',
    body: new URLSearchParams(form).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 403', async () => {
  verifyMock.mockReturnValue(false)
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ From: 'whatsapp:+971501234567', Body: 'hi' }) as never)
  expect(res.status).toBe(403)
})

test('a known member phone records an inbound whatsapp message', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({ results: {
    profiles: { data: [{ id: 'a1', box_id: 'b1', phone: '0501234567' }], error: null },
    conversations: { data: { id: 'cv1' }, error: null },
    messages: { data: null, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ From: 'whatsapp:+971501234567', Body: 'Is the 6am on?' }) as never)
  expect(res.status).toBe(200)
  const up = svc.builder('conversations').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ box_id: 'b1', member_id: 'a1', last_sender_role: 'member', staff_unread: true }))
  expect(up.last_wa_inbound_at).toBeTruthy()
  const msg = svc.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ conversation_id: 'cv1', sender_id: 'a1', sender_role: 'member', channel: 'whatsapp', body: 'Is the 6am on?' }))
})

test('an unknown phone is a no-op 200', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({ results: { profiles: { data: [], error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ From: 'whatsapp:+971509999999', Body: 'hi' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('messages')?.insert).toBeUndefined()
})
