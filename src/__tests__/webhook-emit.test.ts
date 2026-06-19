import { test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { emitWebhook } from '@/lib/webhooks/emit'

test('no matching subscriptions → enqueues nothing', async () => {
  const s = makeSupabaseMock({ results: { webhook_subscriptions: { data: [], error: null } } })
  await emitWebhook(s as never, 'b1', 'booking.created', { id: 'bk1' })
  expect(s.builder('webhook_deliveries')).toBeUndefined()
})

test('one delivery row per active subscription, with an event_id + payload', async () => {
  const s = makeSupabaseMock({ results: {
    webhook_subscriptions: { data: [{ id: 'sub1' }, { id: 'sub2' }], error: null },
    webhook_deliveries: { data: null, error: null },
  } })
  await emitWebhook(s as never, 'b1', 'booking.created', { id: 'bk1', member_id: 'a1' })
  expect(s.builder('webhook_subscriptions').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(s.builder('webhook_subscriptions').eq).toHaveBeenCalledWith('active', true)
  expect(s.builder('webhook_subscriptions').contains).toHaveBeenCalledWith('event_types', ['booking.created'])
  const rows = s.builder('webhook_deliveries').insert.mock.calls[0][0]
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ subscription_id: 'sub1', box_id: 'b1', event_type: 'booking.created', payload: { id: 'bk1', member_id: 'a1' } })
  expect(rows[0].event_id).toMatch(/[0-9a-f-]{36}/)
})

test('never throws (swallows a DB error)', async () => {
  const s = makeSupabaseMock({ results: { webhook_subscriptions: { data: null, error: { message: 'boom' } } } })
  await expect(emitWebhook(s as never, 'b1', 'member.created', {})).resolves.toBeUndefined()
})
