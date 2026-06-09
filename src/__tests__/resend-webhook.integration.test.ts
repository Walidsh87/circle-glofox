import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('svix', () => ({ Webhook: class { verify = verifyMock } }))
vi.mock('@/env', () => ({ env: { RESEND_WEBHOOK_SECRET: 'whsec_test', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/resend/route'

function reqWith(body: unknown) {
  return new Request('http://x/api/webhooks/resend', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'svix-id': 'i', 'svix-timestamp': 't', 'svix-signature': 's' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 400', async () => {
  verifyMock.mockImplementationOnce(() => { throw new Error('bad sig') })
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ type: 'email.opened', data: { email_id: 're_1' } }) as never)
  expect(res.status).toBe(400)
})

test('opened event marks the recipient opened', async () => {
  verifyMock.mockReturnValue(undefined)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ type: 'email.opened', data: { email_id: 're_1' } }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('broadcast_recipients').update).toHaveBeenCalledWith(expect.objectContaining({ opened_at: expect.any(String) }))
  expect(svc.builder('broadcast_recipients').eq).toHaveBeenCalledWith('resend_id', 're_1')
})

test('complaint event suppresses the member', async () => {
  verifyMock.mockReturnValue(undefined)
  const svc = makeSupabaseMock({ results: { broadcast_recipients: { data: { athlete_id: 'a1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ type: 'email.complained', data: { email_id: 're_1' } }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ marketing_opt_out: true })
})
