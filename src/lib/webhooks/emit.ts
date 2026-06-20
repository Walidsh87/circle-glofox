import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import type { WebhookEvent } from './events'

/**
 * Enqueue an outbound webhook: one delivery row per active subscription in the
 * box that wants this event. The delivery cron does the actual HTTP send. NEVER
 * throws — a webhook hiccup must not break the domain action (audit.ts pattern).
 * Must be called with the SERVICE client (the webhook tables are service-role-only).
 */
export async function emitWebhook(
  service: SupabaseClient,
  boxId: string,
  eventType: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: subs } = await service
      .from('webhook_subscriptions')
      .select('id')
      .eq('box_id', boxId)
      .eq('active', true)
      .contains('event_types', [eventType])
    if (!subs || subs.length === 0) return
    const rows = (subs as { id: string }[]).map((s) => ({
      subscription_id: s.id,
      box_id: boxId,
      event_type: eventType,
      event_id: crypto.randomUUID(),
      payload,
    }))
    await service.from('webhook_deliveries').insert(rows)
  } catch (e) {
    console.error('[emitWebhook] enqueue failed:', e)
  }
}
