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

import { GET } from '@/app/api/cron/sequences/route'

function req(auth: string | null) {
  return new Request('http://x/api/cron/sequences', { headers: auth ? { authorization: auth } : {} })
}

const today = new Date().toISOString().slice(0, 10)
const minus = (d: number) => new Date(Date.parse(today + 'T00:00:00Z') - d * 86_400_000).toISOString().slice(0, 10)

const welcomeSeq = { id: 'sq1', box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 0, steps: [{ offset_days: 0, subject: 'Welcome', body_blocks: [{ type: 'heading', text: 'Hi {{first_name}}' }] }] }

function base(over: { sequences?: unknown[]; enrollments?: unknown[]; sends?: unknown[]; profiles?: unknown[]; memberships?: unknown[]; bookings?: unknown[] } = {}) {
  return makeSupabaseMock({
    results: {
      sequences: { data: over.sequences ?? [welcomeSeq], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      profiles: { data: over.profiles ?? [{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, created_at: today, date_of_birth: null, unsubscribe_token: 'tok1' }], error: null },
      memberships: { data: over.memberships ?? [{ athlete_id: 'a1', payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null, is_trial: false }], error: null },
      bookings: { data: over.bookings ?? [], error: null },
      sequence_enrollments: { data: over.enrollments ?? [], error: null },
      sequence_sends: { data: over.sends ?? [], error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('rejects a bad cron secret', async () => {
  serviceCreate.mockReturnValue(base())
  const res = await GET(req('Bearer wrong') as never)
  expect(res.status).toBe(401)
})

test('enroll pass inserts an enrollment for a matching member', async () => {
  const svc = base({ enrollments: [] })   // member joined today, trigger joined/0 → match
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  const ins = svc.builder('sequence_enrollments').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.arrayContaining([expect.objectContaining({ sequence_id: 'sq1', athlete_id: 'a1', enroll_key: 'joined', status: 'active' })]))
})

test('advance pass sends the due step and logs it', async () => {
  const svc = base({ enrollments: [{ id: 'en1', sequence_id: 'sq1', athlete_id: 'a1', enrolled_on: today, enroll_key: 'joined', status: 'active' }], sends: [] })
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).toHaveBeenCalledTimes(1)
  const sendInsert = svc.builder('sequence_sends').insert.mock.calls[0][0]
  expect(sendInsert).toEqual(expect.objectContaining({ enrollment_id: 'en1', step_index: 0, resend_id: 're_1' }))
})

test('a returned member is exited, not emailed (no_checkin)', async () => {
  const winback = { id: 'sq2', box_id: 'b1', name: 'Win-back', trigger_type: 'no_checkin', trigger_days: 14, steps: [{ offset_days: 0, subject: 'Miss you', body_blocks: [{ type: 'heading', text: 'Hi' }] }] }
  const svc = base({
    sequences: [winback],
    enrollments: [{ id: 'en2', sequence_id: 'sq2', athlete_id: 'a1', enrolled_on: minus(20), enroll_key: minus(40), status: 'active' }],
    bookings: [{ athlete_id: 'a1', class_instances: { starts_at: minus(4) + 'T10:00:00Z' } }], // checked in 4d ago, after enrolling
  })
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).not.toHaveBeenCalled()
  expect(svc.builder('sequence_enrollments').update).toHaveBeenCalledWith({ status: 'exited' })
})
