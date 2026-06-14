import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { webpushMock, fakeEnv } = vi.hoisted(() => ({
  webpushMock: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
  fakeEnv: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pk' as string | undefined, VAPID_PRIVATE_KEY: 'sk' as string | undefined } },
}))
vi.mock('web-push', () => ({ default: webpushMock }))
vi.mock('@/env', () => fakeEnv)

import { buildDigestPushes, sendPushTo } from '@/lib/push'

beforeEach(() => {
  vi.clearAllMocks()
  fakeEnv.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pk'
  fakeEnv.env.VAPID_PRIVATE_KEY = 'sk'
  webpushMock.sendNotification.mockResolvedValue(undefined)
})

// ── buildDigestPushes (pure) ───────────────────────────────────

test('groups classes per athlete, sorted by start time', () => {
  const res = buildDigestPushes([
    { athlete_id: 'a', box_id: 'box1', starts_at: '2026-06-11T14:00:00Z', class_name: 'Yoga' },
    { athlete_id: 'a', box_id: 'box1', starts_at: '2026-06-11T03:00:00Z', class_name: 'CrossFit' },
    { athlete_id: 'b', box_id: 'box1', starts_at: '2026-06-11T14:00:00Z', class_name: 'Yoga' },
  ], 'Asia/Dubai')
  expect(res).toHaveLength(2)
  const a = res.find((r) => r.athleteId === 'a')!
  expect(a.payload.body).toBe('CrossFit at 07:00, Yoga at 18:00') // Dubai = UTC+4
})

test('a single class reads as one entry', () => {
  const res = buildDigestPushes([{ athlete_id: 'a', box_id: 'box1', starts_at: '2026-06-11T14:00:00Z', class_name: 'CrossFit' }], 'Asia/Dubai')
  expect(res[0].payload.title).toBe('Today at the gym')
  expect(res[0].payload.body).toBe('CrossFit at 18:00')
  expect(res[0].payload.url).toBe('/dashboard/schedule')
})

test('empty input yields no pushes', () => {
  expect(buildDigestPushes([], 'Asia/Dubai')).toEqual([])
})

// ── sendPushTo ─────────────────────────────────────────────────

test('sends the payload to every subscription of the athlete', async () => {
  const svc = makeSupabaseMock({ results: { push_subscriptions: { data: [
    { id: 's1', endpoint: 'https://p/1', p256dh: 'k1', auth: 'a1' },
    { id: 's2', endpoint: 'https://p/2', p256dh: 'k2', auth: 'a2' },
  ], error: null } } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent = await sendPushTo(svc as any, 'ath1', 'box1', { title: 'T', body: 'B', url: '/u' })
  expect(sent).toBe(2)
  expect(webpushMock.sendNotification).toHaveBeenCalledTimes(2)
  expect(webpushMock.sendNotification.mock.calls[0][0]).toEqual({ endpoint: 'https://p/1', keys: { p256dh: 'k1', auth: 'a1' } })
  expect(JSON.parse(webpushMock.sendNotification.mock.calls[0][1])).toEqual({ title: 'T', body: 'B', url: '/u' })
})

test('prunes a subscription when the push service returns 410', async () => {
  const svc = makeSupabaseMock({ results: { push_subscriptions: [
    { data: [{ id: 's1', endpoint: 'https://p/1', p256dh: 'k1', auth: 'a1' }], error: null }, // select
    { data: null, error: null },                                                              // delete
  ] } })
  webpushMock.sendNotification.mockRejectedValueOnce({ statusCode: 410 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent = await sendPushTo(svc as any, 'ath1', 'box1', { title: 'T', body: 'B', url: '/u' })
  expect(sent).toBe(0)
  expect(svc.builder('push_subscriptions').delete).toHaveBeenCalled()
  expect(svc.builder('push_subscriptions').eq).toHaveBeenCalledWith('id', 's1')
})

test('returns 0 and never touches web-push when VAPID keys are missing', async () => {
  fakeEnv.env.VAPID_PRIVATE_KEY = undefined
  const svc = makeSupabaseMock({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent = await sendPushTo(svc as any, 'ath1', 'box1', { title: 'T', body: 'B', url: '/u' })
  expect(sent).toBe(0)
  expect(webpushMock.sendNotification).not.toHaveBeenCalled()
  expect(svc.builder('push_subscriptions')).toBeUndefined()
})

test('a non-410 send failure is logged but does not prune or throw', async () => {
  const svc = makeSupabaseMock({ results: { push_subscriptions: { data: [{ id: 's1', endpoint: 'https://p/1', p256dh: 'k1', auth: 'a1' }], error: null } } })
  webpushMock.sendNotification.mockRejectedValueOnce({ statusCode: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent = await sendPushTo(svc as any, 'ath1', 'box1', { title: 'T', body: 'B', url: '/u' })
  expect(sent).toBe(0)
  expect(svc.builder('push_subscriptions').delete).not.toHaveBeenCalled()
})
