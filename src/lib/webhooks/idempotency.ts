import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Idempotency gate: write a marker row keyed on stripe_event_id (unique).
 * Returns true if we should proceed, false if this event was already handled
 * (caller should return 200 without doing more work).
 *
 * Stripe retries delivery aggressively. Without this gate, counters like
 * failed_charge_attempts can increment multiple times for a single real failure.
 */
export async function claimEvent(
  service: ServiceClient,
  boxId: string,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { error } = await service.from('payment_events').insert({
    box_id: boxId,
    stripe_event_id: eventId,
    event_type: eventType,
    amount_aed: 0,
  })
  // 23505 = unique_violation → already processed
  if (error && error.code !== '23505') {
    // log but don't block — better to risk a duplicate than miss the event
    console.error('claimEvent insert failed:', error)
    return true
  }
  return !error
}
