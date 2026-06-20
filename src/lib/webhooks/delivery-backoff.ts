// Retry schedule for failed webhook deliveries (#65 Phase 3). Exponential backoff
// doubling from 60s, capped at 6h, with a hard attempt ceiling after which a
// subscription is parked/disabled.

export const MAX_WEBHOOK_ATTEMPTS = 8

const BASE_SECONDS = 60
const CAP_SECONDS = 21600 // 6 hours

export function backoffSeconds(attempt: number): number {
  const n = attempt < 1 ? 1 : attempt
  return Math.min(BASE_SECONDS * 2 ** (n - 1), CAP_SECONDS)
}
