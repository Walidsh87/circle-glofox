import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, auditSpy, safeUrlSpy } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  auditSpy: vi.fn(),
  safeUrlSpy: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/webhooks/validate-url', () => ({ isSafeWebhookUrl: safeUrlSpy }))
vi.mock('@/lib/audit', () => ({ logAudit: auditSpy }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createWebhook } from '@/app/dashboard/settings/_actions/create-webhook'

function owner() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'box-A', role: 'owner', full_name: 'Owner' }, error: null } } })
}
function serviceWithInsert() {
  return makeSupabaseMock({ results: { webhook_subscriptions: { data: { id: 'sub-1' }, error: null } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  safeUrlSpy.mockReturnValue({ ok: true }) // default: URL passes the SSRF guard
})

test('non-owner is rejected and no subscription is inserted', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'box-A', role: 'coach' }, error: null } } }))
  const res = await createWebhook('https://hooks.example.com/x', ['booking.created'])
  expect(res.error).toMatch(/owner/i)
  expect(res.secret).toBeUndefined()
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('rejects an unsafe URL with the validator’s reason (e.g. http / private IP)', async () => {
  serverCreate.mockResolvedValue(owner())
  safeUrlSpy.mockReturnValue({ ok: false, reason: 'Webhook URL must use https.' })
  const res = await createWebhook('http://10.0.0.1/x', ['booking.created'])
  expect(res.error).toBe('Webhook URL must use https.')
  expect(res.secret).toBeUndefined()
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('rejects when no valid events are chosen', async () => {
  serverCreate.mockResolvedValue(owner())
  expect((await createWebhook('https://hooks.example.com/x', [])).error).toMatch(/event/i)
  expect((await createWebhook('https://hooks.example.com/x', ['not-an-event'])).error).toMatch(/event/i)
})

test('happy path: returns a whsec_ secret once, binds the box + events, logs an audit event', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = serviceWithInsert()
  serviceCreate.mockReturnValue(svc)

  const res = await createWebhook('  https://hooks.example.com/circle  ', ['booking.created', 'payment.succeeded', 'bogus'])
  expect(res.error).toBeNull()
  expect(res.secret?.startsWith('whsec_')).toBe(true)

  // inserted under the OWNER's box, URL trimmed, only valid events kept, created_by bound
  const insertArg = svc.builder('webhook_subscriptions').insert.mock.calls[0][0]
  expect(insertArg.box_id).toBe('box-A')
  expect(insertArg.url).toBe('https://hooks.example.com/circle')
  expect(insertArg.event_types).toEqual(['booking.created', 'payment.succeeded'])
  expect(insertArg.created_by).toBe('owner1')
  expect(insertArg.secret).toBe(res.secret) // the row keeps the secret the cron signs with

  expect(auditSpy).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'webhook.subscribed', boxId: 'box-A', target: 'sub-1' }),
  )
})
