import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, envHolder, rlHolder } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  envHolder: { API_KEY_PEPPER: 'test-pepper-0123456789-0123456789' as string | undefined }, // gitleaks:allow
  rlHolder: { allowed: true },
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/env', () => ({ env: envHolder }))
vi.mock('@/lib/rate-limit', () => ({ checkApiRateLimit: vi.fn(async () => rlHolder.allowed) }))

import { withApiKey } from '@/lib/api/with-api-key'
import { jsonOk } from '@/lib/api/respond'

function req(auth?: string) {
  return new Request('https://x/api/v1/members', { headers: auth ? { authorization: auth } : {} })
}
// A key row the (filter-ignoring) mock returns for any lookup.
function keyRow(over: Record<string, unknown> = {}) {
  return makeSupabaseMock({ results: { api_keys: { data: { id: 'k1', box_id: 'box-A', scopes: ['members:read'], revoked_at: null, ...over }, error: null } } })
}

const handler = vi.fn(async (_req: Request, ctx: { boxId: string }) => jsonOk({ box: ctx.boxId }))
const GET = withApiKey('members:read', handler)

beforeEach(() => {
  vi.clearAllMocks()
  envHolder.API_KEY_PEPPER = 'test-pepper-0123456789-0123456789' // gitleaks:allow
  rlHolder.allowed = true
})

test('missing Authorization → 401, handler not called', async () => {
  serviceCreate.mockReturnValue(keyRow())
  const res = await GET(req())
  expect(res.status).toBe(401)
  expect(handler).not.toHaveBeenCalled()
})

test('malformed bearer → 401', async () => {
  serviceCreate.mockReturnValue(keyRow())
  expect((await GET(req('Bearer not-a-key'))).status).toBe(401)
})

test('valid key but missing scope → 403', async () => {
  serviceCreate.mockReturnValue(keyRow({ scopes: ['packages:read'] }))
  const res = await GET(req('Bearer ck_live_abcdef'))
  expect(res.status).toBe(403)
  expect(handler).not.toHaveBeenCalled()
})

test('revoked key → 401', async () => {
  serviceCreate.mockReturnValue(keyRow({ revoked_at: '2026-01-01' }))
  expect((await GET(req('Bearer ck_live_abcdef'))).status).toBe(401)
})

test('rate-limited → 429 with Retry-After', async () => {
  serviceCreate.mockReturnValue(keyRow())
  rlHolder.allowed = false
  const res = await GET(req('Bearer ck_live_abcdef'))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBe('60')
})

test('API not configured (no pepper) → 401', async () => {
  envHolder.API_KEY_PEPPER = undefined
  serviceCreate.mockReturnValue(keyRow())
  expect((await GET(req('Bearer ck_live_abcdef'))).status).toBe(401)
})

test('valid key + scope + allowed → handler called with the box from the KEY', async () => {
  serviceCreate.mockReturnValue(keyRow())
  const res = await GET(req('Bearer ck_live_abcdef'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ box: 'box-A' })
  expect(handler).toHaveBeenCalledOnce()
})
