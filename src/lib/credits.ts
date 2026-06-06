// Pure credit-entitlement logic. No I/O — mirrors membership-status.ts.
// Atomic mutation of credits_remaining happens in the consume_credit /
// refund_credit SQL functions (migration 023), called via the service role.

export type CreditBatch = {
  id: string
  credits_remaining: number
  /** 'YYYY-MM-DD', or null = never expires. */
  expires_at: string | null
}

export type EntitlementDecision =
  | { kind: 'membership' }
  | { kind: 'credit'; batch: CreditBatch }
  | { kind: 'none' }

/**
 * The batch to draw a class credit from: soonest-expiring, non-expired
 * (expires_at >= today, or null), with credits left. Dated batches are used
 * before never-expiring ones so perishable credits aren't wasted. null = none.
 */
export function selectBestBatch(batches: CreditBatch[], today: string): CreditBatch | null {
  // The `credits_remaining > 0` guard is intentionally redundant with the
  // `.gt('credits_remaining', 0)` DB pre-filter in book-class.ts — this keeps
  // the function correct on its own for any caller (and for the unit tests).
  const usable = batches.filter(
    (b) => b.credits_remaining > 0 && (b.expires_at === null || b.expires_at >= today),
  )
  if (usable.length === 0) return null
  return usable.slice().sort((a, b) => {
    if (a.expires_at === b.expires_at) return 0
    if (a.expires_at === null) return 1 // never-expiring sorts last
    if (b.expires_at === null) return -1
    return a.expires_at < b.expires_at ? -1 : 1
  })[0]
}

/** Booking precedence: paid membership → credit → refuse. */
export function decideEntitlement(
  membershipPaid: boolean,
  bestBatch: CreditBatch | null,
): EntitlementDecision {
  if (membershipPaid) return { kind: 'membership' }
  if (bestBatch) return { kind: 'credit', batch: bestBatch }
  return { kind: 'none' }
}
