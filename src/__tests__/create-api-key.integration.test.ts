import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, envHolder, auditSpy } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  envHolder: { API_KEY_PEPPER: 'test-pepper-0123456789-0123456789' as string | undefined }, // gitleaks:allow
  auditSpy: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/env', () => ({ env: envHolder }))
vi.mock('@/lib/audit', () => ({ logAudit: auditSpy }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createApiKey } from '@/app/dashboard/settings/_actions/create-api-key'

function owner() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'box-A', role: 'owner', full_name: 'Owner' }, error: null } } })
}
function serviceWithInsert() {
  return makeSupabaseMock({ results: { api_keys: { data: { id: 'newkey1' }, error: null } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  envHolder.API_KEY_PEPPER = 'test-pepper-0123456789-0123456789' // gitleaks:allow
})

test('non-owner is rejected and no key is inserted', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'box-A', role: 'coach' }, error: null } } }))
  const res = await createApiKey('Zapier', ['members:read'])
  expect(res.error).toMatch(/owner/i)
  expect(res.plaintext).toBeUndefined()
})

test('rejects an empty name and an empty scope set', async () => {
  serverCreate.mockResolvedValue(owner())
  expect((await createApiKey('   ', ['members:read'])).error).toMatch(/name/i)
  expect((await createApiKey('Zapier', [])).error).toMatch(/scope/i)
  expect((await createApiKey('Zapier', ['not-a-scope'])).error).toMatch(/scope/i)
})

test('reports when the API is not configured (no pepper)', async () => {
  serverCreate.mockResolvedValue(owner())
  envHolder.API_KEY_PEPPER = undefined
  expect((await createApiKey('Zapier', ['members:read'])).error).toMatch(/not configured/i)
})

test('happy path: returns the plaintext once, binds the box, logs an audit event', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = serviceWithInsert()
  serviceCreate.mockReturnValue(svc)

  const res = await createApiKey('Zapier prod', ['members:read', 'members:pii', 'bogus'])
  expect(res.error).toBeNull()
  expect(res.plaintext?.startsWith('ck_live_')).toBe(true)

  // inserted under the OWNER's box, only valid scopes kept, hash stored (not plaintext)
  const insertArg = svc.builder('api_keys').insert.mock.calls[0][0]
  expect(insertArg.box_id).toBe('box-A')
  expect(insertArg.scopes).toEqual(['members:read', 'members:pii'])
  expect(insertArg.key_hash).toMatch(/^[0-9a-f]{64}$/)
  expect(insertArg).not.toHaveProperty('key') // never stores plaintext
  expect(JSON.stringify(insertArg)).not.toContain(res.plaintext)

  expect(auditSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'api.key_issued', boxId: 'box-A' }))
})
