import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, envHolder } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  envHolder: { API_KEY_PEPPER: 'test-pepper-0123456789-0123456789' as string | undefined }, // gitleaks:allow
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/env', () => ({ env: envHolder }))
vi.mock('@/lib/rate-limit', () => ({ checkApiRateLimit: vi.fn(async () => true) }))

import { GET } from '@/app/api/v1/members/route'

const MEMBERS = [
  { id: 'm1', full_name: 'Sara', role: 'athlete', created_at: '2026-06-02', email: 'sara@x.com', phone: '+9715', id_number: '784-SECRET', blood_type: 'O+' },
  { id: 'm2', full_name: 'Omar', role: 'athlete', created_at: '2026-06-01', email: 'omar@x.com', phone: '+9716', id_number: '784-SECRET2', blood_type: 'A+' },
]

// One mock backs both the api_keys auth lookup and the profiles read.
function svcFor(scopes: string[]) {
  return makeSupabaseMock({
    results: {
      api_keys: { data: { id: 'k1', box_id: 'box-A', scopes, revoked_at: null }, error: null },
      profiles: { data: MEMBERS, error: null },
    },
  })
}
function req() {
  return new Request('https://x/api/v1/members?limit=50', { headers: { authorization: 'Bearer ck_live_abcdef' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  envHolder.API_KEY_PEPPER = 'test-pepper-0123456789-0123456789' // gitleaks:allow
})

test('box-scopes the read by the KEY’s box (not the request)', async () => {
  const svc = svcFor(['members:read'])
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req())
  expect(res.status).toBe(200)
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'box-A')
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('role', 'athlete')
})

test('without members:pii → no email/phone and never lockdown PII', async () => {
  serviceCreate.mockReturnValue(svcFor(['members:read']))
  const body = await (await GET(req())).json()
  expect(body.data).toHaveLength(2)
  expect(body.data[0]).toEqual({ id: 'm1', full_name: 'Sara', role: 'athlete', created_at: '2026-06-02' })
  for (const row of body.data) {
    expect(row).not.toHaveProperty('email')
    expect(row).not.toHaveProperty('id_number')
    expect(row).not.toHaveProperty('blood_type')
  }
})

test('with members:pii → email/phone included, still no lockdown PII', async () => {
  serviceCreate.mockReturnValue(svcFor(['members:read', 'members:pii']))
  const body = await (await GET(req())).json()
  expect(body.data[0]).toMatchObject({ id: 'm1', email: 'sara@x.com', phone: '+9715' })
  for (const row of body.data) {
    expect(row).not.toHaveProperty('id_number')
    expect(row).not.toHaveProperty('blood_type')
  }
})

test('returns a next_cursor envelope', async () => {
  serviceCreate.mockReturnValue(svcFor(['members:read']))
  const body = await (await GET(req())).json()
  expect(body).toHaveProperty('next_cursor')
  expect(Array.isArray(body.data)).toBe(true)
})
