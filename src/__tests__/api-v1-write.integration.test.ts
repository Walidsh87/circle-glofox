import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, envHolder } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  envHolder: { API_KEY_PEPPER: 'test-pepper-0123456789-0123456789' as string | undefined }, // gitleaks:allow
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/env', () => ({ env: envHolder }))
vi.mock('@/lib/rate-limit', () => ({ checkApiRateLimit: vi.fn(async () => true) }))

import { POST as bookingsPost } from '@/app/api/v1/bookings/route'
import { POST as leadsPost } from '@/app/api/v1/leads/route'

function post(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { authorization: 'Bearer ck_live_abcdef', 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
const KEY = (scopes: string[]) => ({ api_keys: { data: { id: 'k1', box_id: 'b1', scopes, revoked_at: null }, error: null } })

beforeEach(() => {
  vi.clearAllMocks()
  envHolder.API_KEY_PEPPER = 'test-pepper-0123456789-0123456789' // gitleaks:allow
})

test('POST /bookings requires class_instance_id + member_id → 400', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { ...KEY(['bookings:write']) } }))
  const res = await bookingsPost(post('https://x/api/v1/bookings', { member_id: 'a1' }))
  expect(res.status).toBe(400)
  expect((await res.json()).error.code).toBe('validation_error')
})

test('POST /bookings without bookings:write scope → 403', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { ...KEY(['bookings:read']) } }))
  expect((await bookingsPost(post('https://x/api/v1/bookings', { class_instance_id: 'c1', member_id: 'a1' }))).status).toBe(403)
})

test('POST /bookings — paid member → 201 with booking id', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: {
      ...KEY(['bookings:write']),
      class_instances: { data: { id: 'c1', capacity: 10, box_id: 'b1', starts_at: '2099-01-01T00:00:00Z', boxes: { booking_close_minutes: 0 } }, error: null },
      profiles: { data: { id: 'a1', household_id: null }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
      package_credits: { data: [], error: null },
      bookings: [{ data: null, error: null, count: 0 }, { data: { id: 'bk1' }, error: null }],
    },
  }))
  const res = await bookingsPost(post('https://x/api/v1/bookings', { class_instance_id: 'c1', member_id: 'a1' }))
  expect(res.status).toBe(201)
  expect((await res.json()).data.id).toBe('bk1')
})

test('POST /bookings — no entitlement → 422', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: {
      ...KEY(['bookings:write']),
      class_instances: { data: { id: 'c1', capacity: 10, box_id: 'b1', starts_at: '2099-01-01T00:00:00Z', boxes: { booking_close_minutes: 0 } }, error: null },
      profiles: { data: { id: 'a1', household_id: null }, error: null },
      memberships: { data: [], error: null },
      package_credits: { data: [], error: null },
      bookings: { data: null, error: null, count: 0 },
    },
  }))
  const res = await bookingsPost(post('https://x/api/v1/bookings', { class_instance_id: 'c1', member_id: 'a1' }))
  expect(res.status).toBe(422)
  expect((await res.json()).error.code).toBe('needs_entitlement')
})

test('POST /leads validates name/contact → 400', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { ...KEY(['leads:write']) } }))
  expect((await leadsPost(post('https://x/api/v1/leads', { full_name: '' }))).status).toBe(400)
})

test('POST /leads — valid → 201 + lead id, box-bound', async () => {
  const svc = makeSupabaseMock({ results: { ...KEY(['leads:write']), leads: { data: { id: 'lead1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await leadsPost(post('https://x/api/v1/leads', { full_name: 'Sara', email: 'sara@x.com', source: 'zapier' }))
  expect(res.status).toBe(201)
  expect((await res.json()).data.id).toBe('lead1')
  expect(svc.builder('leads').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', full_name: 'Sara', source: 'zapier' }))
})
