import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { anonCreate, serviceCreate, rlHolder } = vi.hoisted(() => ({
  anonCreate: vi.fn(),
  serviceCreate: vi.fn(),
  rlHolder: { allowed: true },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: anonCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/rate-limit', () => ({ checkApiRateLimit: vi.fn(async () => rlHolder.allowed) }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' } }))

import { withMemberAuth } from '@/lib/api/with-member-auth'
import { jsonOk } from '@/lib/api/respond'

function req(auth?: string) {
  return new Request('https://x/api/app/bookings', { method: 'POST', headers: auth ? { authorization: auth } : {} })
}

const handler = vi.fn(async (_req: Request, ctx: { userId: string; boxId: string }) => jsonOk({ userId: ctx.userId, boxId: ctx.boxId }))
const POST = withMemberAuth(handler)

// Valid token → user u1; their profile is in box-A.
function validUser() {
  anonCreate.mockReturnValue(makeSupabaseMock({ user: { id: 'u1' } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: { box_id: 'box-A', role: 'athlete' }, error: null } } }))
}

beforeEach(() => {
  vi.clearAllMocks()
  rlHolder.allowed = true
})

test('missing Authorization → 401, handler not called', async () => {
  validUser()
  const res = await POST(req())
  expect(res.status).toBe(401)
  expect(handler).not.toHaveBeenCalled()
})

test('malformed bearer → 401', async () => {
  validUser()
  expect((await POST(req('Token abc'))).status).toBe(401)
  expect(handler).not.toHaveBeenCalled()
})

test('invalid/expired token (no user) → 401, handler not called', async () => {
  anonCreate.mockReturnValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: { box_id: 'box-A' }, error: null } } }))
  const res = await POST(req('Bearer some.jwt.token'))
  expect(res.status).toBe(401)
  expect(handler).not.toHaveBeenCalled()
})

test('valid token but no gym profile → 403, handler not called', async () => {
  anonCreate.mockReturnValue(makeSupabaseMock({ user: { id: 'u1' } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: null, error: null } } }))
  const res = await POST(req('Bearer some.jwt.token'))
  expect(res.status).toBe(403)
  expect(handler).not.toHaveBeenCalled()
})

test('rate-limited → 429 with Retry-After', async () => {
  validUser()
  rlHolder.allowed = false
  const res = await POST(req('Bearer some.jwt.token'))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBe('60')
  expect(handler).not.toHaveBeenCalled()
})

test('valid token → handler called with userId from the TOKEN and boxId from the PROFILE', async () => {
  validUser()
  const res = await POST(req('Bearer some.jwt.token'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ userId: 'u1', boxId: 'box-A' })
  expect(handler).toHaveBeenCalledOnce()
})
