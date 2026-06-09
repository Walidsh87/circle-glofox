import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, emailMock } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  emailMock: vi.fn<(messages: { to: string; subject: string; html: string }[]) => Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }>>(
    () => Promise.resolve({ ok: true, error: null, ids: ['re_1'] })
  ),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('@/env', () => ({ env: { CRON_SECRET: 'secret', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k', NEXT_PUBLIC_APP_URL: 'https://app', RESEND_FROM_EMAIL: 'a@x.com' } }))

import { GET } from '@/app/api/cron/automations/route'

function req(auth: string | null) {
  return new Request('http://x/api/cron/automations', { headers: auth ? { authorization: auth } : {} })
}

// today is dynamic; build a member who joined exactly 7 days ago.
const today = new Date().toISOString().slice(0, 10)
const sevenAgo = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86_400_000).toISOString().slice(0, 10)

function boxData(runsExisting: unknown[] = []) {
  return makeSupabaseMock({
    results: {
      automations: { data: [{ id: 'au1', box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 7, subject: 'Welcome', body_blocks: [{ type: 'heading', text: 'Hi {{first_name}}' }] }], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      profiles: { data: [{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, created_at: sevenAgo, date_of_birth: null, unsubscribe_token: 'tok1' }], error: null },
      memberships: { data: [{ athlete_id: 'a1', payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null, is_trial: false }], error: null },
      bookings: { data: [], error: null },
      automation_runs: { data: runsExisting, error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('rejects a bad cron secret', async () => {
  serviceCreate.mockReturnValue(boxData())
  const res = await GET(req('Bearer wrong') as never)
  expect(res.status).toBe(401)
})

test('sends a matching automation and records the run with resend id', async () => {
  const svc = boxData()
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).toHaveBeenCalledTimes(1)
  const runInsert = svc.builder('automation_runs').insert.mock.calls[0][0]
  expect(runInsert).toEqual(expect.arrayContaining([expect.objectContaining({ automation_id: 'au1', athlete_id: 'a1', fire_key: 'joined', resend_id: 're_1' })]))
})

test('skips a member already in automation_runs for that fire_key', async () => {
  const svc = boxData([{ automation_id: 'au1', athlete_id: 'a1', fire_key: 'joined' }])
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).not.toHaveBeenCalled()
})
