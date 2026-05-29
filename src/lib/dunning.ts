// Pure dunning helpers. No I/O — unit-testable.

export type DunningDecision = {
  /** Should the membership be flipped to overdue (past_due) after this failure? */
  markOverdue: boolean
  /** Should we send the member a "card failed" email this time? */
  sendEmail: boolean
  /** New attempt count to persist. */
  newAttemptCount: number
}

/**
 * Decide what to do after a Stripe charge fails.
 *
 * Policy:
 * - Send an email on every failure (the member needs to act).
 * - Stripe retries on its own per the gym's Smart Retries config; we just count attempts.
 * - Once attempts >= maxRetries, mark the membership overdue so check-ins are blocked.
 */
export function decideAfterFailedCharge(
  currentAttempts: number,
  maxRetries: number,
): DunningDecision {
  const newAttemptCount = currentAttempts + 1
  return {
    markOverdue: newAttemptCount >= maxRetries,
    sendEmail: true,
    newAttemptCount,
  }
}

/** Reset state on a successful charge. */
export function resetAfterSuccess(): { failed_charge_attempts: 0; last_failed_at: null } {
  return { failed_charge_attempts: 0, last_failed_at: null }
}

/** Is this membership in active dunning (has failed attempts but not yet given up on)? */
export function isInDunning(attempts: number, maxRetries: number): boolean {
  return attempts > 0 && attempts < maxRetries
}
