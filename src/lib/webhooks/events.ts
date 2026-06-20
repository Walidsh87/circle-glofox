// The catalog of domain events a gym can subscribe to (#65 Phase 3). Shared by
// the emit helper, the delivery cron, and the subscription UI.
export const WEBHOOK_EVENTS = [
  'booking.created',
  'booking.cancelled',
  'member.created',
  'membership.created',
  'membership.updated',
  'payment.succeeded',
  'payment.failed',
  'lead.created',
  'workout_score.logged',
  'invoice.created',
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export function isWebhookEvent(s: string): s is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(s)
}
