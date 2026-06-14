// Provider-agnostic types for the PaymentProvider port.
// Every PSP adapter (Stripe, Telr, …) translates its native API into these shapes.

export type ProviderKey = 'stripe' | 'telr' | 'tap' | 'checkout' | 'ni' | 'paytabs'

export type CreatePlanInput = {
  planName: string
  monthlyPriceAed: number
}

export type CreateCheckoutInput = {
  planRef: string
  customerRef: string | null
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
  membershipId: string
  quoteId?: string | null
}

// One-shot package purchase. Deliberately guest-style: no `customerRef` (unlike
// the subscription CreateCheckoutInput) — packages aren't recurring, and the
// webhook grants credits by `athlete_id` from metadata, so no Stripe customer
// link is needed. `customerEmail` only prefills the receipt field.
export type CreatePackageCheckoutInput = {
  packageId: string
  athleteId: string
  boxId: string
  packageName: string
  priceAed: number
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
}

export type CreateOneOffCheckoutInput = {
  amountAed: number
  description: string
  quoteId: string
  boxId: string
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
}

export type CreateCustomerInput = {
  email: string | null
  name: string | null
  metadata?: Record<string, string>
}

export type RefundInput = {
  paymentRef: string
  amountAed: number
  metadata?: Record<string, string>
  /**
   * Deterministic idempotency key. When two refund requests arrive concurrently
   * with the same key, the PSP returns the same refund object rather than
   * creating duplicates. Required by the refund action to prevent double-refunds
   * from double-clicks or browser retries.
   */
  idempotencyKey?: string
}

// Normalised webhook event. Every adapter produces one of these from its native event;
// the consuming webhook route knows nothing about Stripe/Telr/etc.
export type NormalisedEvent =
  | {
      kind: 'payment_succeeded'
      rawId: string
      subscriptionRef: string | null
      customerRef: string | null
      chargeRef: string | null
      paymentRef: string | null
      amountAed: number
    }
  | {
      kind: 'payment_failed'
      rawId: string
      subscriptionRef: string | null
      amountAed: number
    }
  | {
      kind: 'charge_succeeded'
      rawId: string
      paymentRef: string
      chargeRef: string
      invoiceChargeRef: string | null
    }
  | {
      kind: 'refunded'
      rawId: string
      paymentRef: string
      refundRef: string
      amountAed: number
      fullyRefunded: boolean
      reason: string | null
    }
  | {
      kind: 'subscription_cancelled'
      rawId: string
      subscriptionRef: string
    }
  | {
      kind: 'checkout_completed'
      rawId: string
      sessionId: string
      subscriptionRef: string | null
      customerRef: string | null
      membershipId: string | null
      packageId: string | null
      athleteId: string | null
      quoteId: string | null
      paymentRef: string | null
      amountAed: number | null
    }
  | { kind: 'unknown'; rawId: string }

export interface PaymentProvider {
  readonly key: ProviderKey

  createPlan(input: CreatePlanInput): Promise<{ planRef: string }>
  createCustomer(input: CreateCustomerInput): Promise<{ customerRef: string }>
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string; sessionId: string }>
  createPackageCheckout(input: CreatePackageCheckoutInput): Promise<{ url: string; sessionId: string }>
  createOneOffCheckout(input: CreateOneOffCheckoutInput): Promise<{ url: string; sessionId: string }>
  createPortalSession(customerRef: string, returnUrl: string): Promise<{ url: string }>
  refund(input: RefundInput): Promise<{ refundRef: string }>

  /** Verify signature and translate native payload into a NormalisedEvent (or null if invalid). */
  verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<NormalisedEvent | null>
}

export class PspConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PspConfigError'
  }
}
