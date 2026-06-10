import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ verifyTwilioSignature: verifyMock }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/twilio-wa/route'

function reqWith(form: Record<string, string>) {
  return new Request('http://x/api/webhooks/twilio-wa', {
    method: 'POST',
    body: new URLSearchParams(form).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 403', async () => {
  verifyMock.mockReturnValue(false)
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ MessageSid: 'WA1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(403)
})

test('delivered status marks the recipient delivered by sid', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'WA1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('wa_recipients').update).toHaveBeenCalledWith({ status: 'delivered' })
  expect(svc.builder('wa_recipients').eq).toHaveBeenCalledWith('twilio_sid', 'WA1')
})

test('read status marks the recipient read', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'WA1', MessageStatus: 'read' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('wa_recipients').update).toHaveBeenCalledWith({ status: 'read' })
})

test('undelivered status marks the recipient failed', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'WA2', MessageStatus: 'undelivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('wa_recipients').update).toHaveBeenCalledWith({ status: 'failed' })
})
