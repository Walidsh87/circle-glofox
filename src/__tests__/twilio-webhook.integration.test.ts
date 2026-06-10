import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ verifyTwilioSignature: verifyMock }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/twilio/route'

function reqWith(form: Record<string, string>) {
  return new Request('http://x/api/webhooks/twilio', {
    method: 'POST',
    body: new URLSearchParams(form).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 403', async () => {
  verifyMock.mockReturnValue(false)
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ MessageSid: 'SM1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(403)
})

test('delivered status marks the recipient delivered by sid', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'SM1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('sms_recipients').update).toHaveBeenCalledWith({ status: 'delivered' })
  expect(svc.builder('sms_recipients').eq).toHaveBeenCalledWith('twilio_sid', 'SM1')
})

test('failed status marks the recipient failed', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'SM2', MessageStatus: 'undelivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('sms_recipients').update).toHaveBeenCalledWith({ status: 'failed' })
})
