import Stripe from 'stripe'
import {
  PspConfigError,
  type CreateCheckoutInput,
  type CreateCustomerInput,
  type CreatePlanInput,
  type NormalisedEvent,
  type PaymentProvider,
  type RefundInput,
} from './types'

export type StripeCredentials = {
  secret_key: string
  webhook_secret: string | null
}

export class StripeProvider implements PaymentProvider {
  readonly key = 'stripe' as const
  private readonly stripe: Stripe
  private readonly webhookSecret: string | null

  constructor(creds: StripeCredentials) {
    if (!creds.secret_key) throw new PspConfigError('Stripe secret key is required.')
    this.stripe = new Stripe(creds.secret_key)
    this.webhookSecret = creds.webhook_secret
  }

  async createPlan(input: CreatePlanInput): Promise<{ planRef: string }> {
    const product = await this.stripe.products.create({ name: input.planName })
    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(input.monthlyPriceAed * 100),
      currency: 'aed',
      recurring: { interval: 'month' },
    })
    return { planRef: price.id }
  }

  async createCustomer(input: CreateCustomerInput): Promise<{ customerRef: string }> {
    const customer = await this.stripe.customers.create({
      email: input.email ?? undefined,
      name: input.name ?? undefined,
      metadata: input.metadata ?? {},
    })
    return { customerRef: customer.id }
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string; sessionId: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: input.planRef, quantity: 1 }],
      ...(input.customerRef ? { customer: input.customerRef } : {}),
      ...(input.customerEmail && !input.customerRef ? { customer_email: input.customerEmail } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { membership_id: input.membershipId },
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL.')
    return { url: session.url, sessionId: session.id }
  }

  async createPortalSession(customerRef: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerRef,
      return_url: returnUrl,
    })
    return { url: session.url }
  }

  async refund(input: RefundInput): Promise<{ refundRef: string }> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentRef,
        amount: Math.round(input.amountAed * 100),
        reason: 'requested_by_customer',
        metadata: input.metadata ?? {},
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    )
    return { refundRef: refund.id }
  }

  async verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<NormalisedEvent | null> {
    if (!this.webhookSecret) return null
    const sig = headers.get('stripe-signature')
    if (!sig) return null

    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sig, this.webhookSecret)
    } catch {
      return null
    }

    return this.translate(event)
  }

  // Exposed (not private) so unit tests can pin the normalisation contract
  // without standing up a real Stripe webhook delivery.
  translate(event: Stripe.Event): NormalisedEvent {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
        return {
          kind: 'payment_succeeded',
          rawId: event.id,
          subscriptionRef: typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id ?? null,
          customerRef: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null,
          chargeRef: inv.id ?? null,
          paymentRef: extractPaymentIntentId(inv),
          amountAed: (inv.amount_paid ?? 0) / 100,
        }
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
        return {
          kind: 'payment_failed',
          rawId: event.id,
          subscriptionRef: typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id ?? null,
          amountAed: (inv.amount_due ?? 0) / 100,
        }
      }
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        return {
          kind: 'checkout_completed',
          rawId: event.id,
          sessionId: s.id,
          subscriptionRef: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null,
          customerRef: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
          membershipId: s.metadata?.membership_id ?? null,
        }
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        return { kind: 'subscription_cancelled', rawId: event.id, subscriptionRef: sub.id }
      }
      case 'charge.succeeded': {
        const charge = event.data.object as Stripe.Charge & { invoice?: string | { id: string } | null }
        const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
        if (!pi) return { kind: 'unknown', rawId: event.id }
        const inv = charge.invoice
        return {
          kind: 'charge_succeeded',
          rawId: event.id,
          paymentRef: pi,
          chargeRef: charge.id,
          invoiceChargeRef: typeof inv === 'string' ? inv : inv?.id ?? null,
        }
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const lastRefund = charge.refunds?.data?.[charge.refunds.data.length - 1]
        if (!lastRefund) return { kind: 'unknown', rawId: event.id }
        return {
          kind: 'refunded',
          rawId: event.id,
          paymentRef: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? '',
          refundRef: lastRefund.id,
          amountAed: (lastRefund.amount ?? 0) / 100,
          fullyRefunded: !!charge.refunded,
          reason: lastRefund.reason ?? null,
        }
      }
      default:
        return { kind: 'unknown', rawId: event.id }
    }
  }
}

function extractPaymentIntentId(invoice: Stripe.Invoice): string | null {
  const pi = (invoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id ?? null
}
