import { describe, test, expect } from 'vitest'
import { StripeProvider } from '@/lib/psp/stripe-provider'

// We don't instantiate the real Stripe SDK in unit tests — instead we test the
// pure `translate` method by reaching past the private modifier. The intent is to
// pin down the normalisation contract so future adapters can mirror it.

function provider() {
  // Cast to `any` so we can hand it untyped event fixtures (mirrors what Stripe
  // delivers, minus the SDK's overloaded types).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new StripeProvider({ secret_key: 'sk_test_dummy', webhook_secret: 'whsec_dummy' }) as any
}

describe('StripeProvider.translate', () => {
  test('invoice.payment_succeeded → payment_succeeded with refs and AED amount', () => {
    const event = {
      id: 'evt_1',
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_123', subscription: 'sub_42', customer: 'cus_77', payment_intent: 'pi_99', amount_paid: 25000 } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'payment_succeeded',
      rawId: 'evt_1',
      subscriptionRef: 'sub_42',
      customerRef: 'cus_77',
      chargeRef: 'in_123',
      paymentRef: 'pi_99',
      amountAed: 250,
    })
  })

  test('invoice.payment_failed → payment_failed with AED amount_due', () => {
    const event = {
      id: 'evt_2',
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_42', amount_due: 25000 } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'payment_failed',
      rawId: 'evt_2',
      subscriptionRef: 'sub_42',
      amountAed: 250,
    })
  })

  test('checkout.session.completed (subscription) → checkout_completed with null package fields', () => {
    const event = {
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', subscription: 'sub_x', customer: 'cus_y', metadata: { membership_id: 'mem_123' } } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'checkout_completed',
      rawId: 'evt_3',
      sessionId: 'cs_1',
      subscriptionRef: 'sub_x',
      customerRef: 'cus_y',
      membershipId: 'mem_123',
      packageId: null,
      athleteId: null,
      quoteId: null,
      programTemplateId: null,
      paymentRef: null,
      amountAed: null,
    })
  })

  test('checkout.session.completed (package, mode=payment) → checkout_completed with package fields', () => {
    const event = {
      id: 'evt_3b',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', payment_intent: 'pi_55', amount_total: 50000, metadata: { package_id: 'pkg_1', athlete_id: 'ath_1', box_id: 'box_1' } } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'checkout_completed',
      rawId: 'evt_3b',
      sessionId: 'cs_2',
      subscriptionRef: null,
      customerRef: null,
      membershipId: null,
      packageId: 'pkg_1',
      athleteId: 'ath_1',
      quoteId: null,
      programTemplateId: null,
      paymentRef: 'pi_55',
      amountAed: 500,
    })
  })

  test('checkout.session.completed (program, mode=payment) → checkout_completed with programTemplateId', () => {
    const event = {
      id: 'evt_3c',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_3', payment_intent: 'pi_77', amount_total: 30000, metadata: { program_template_id: 'tpl_1', athlete_id: 'ath_1', box_id: 'box_1' } } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'checkout_completed',
      rawId: 'evt_3c',
      sessionId: 'cs_3',
      subscriptionRef: null,
      customerRef: null,
      membershipId: null,
      packageId: null,
      athleteId: 'ath_1',
      quoteId: null,
      programTemplateId: 'tpl_1',
      paymentRef: 'pi_77',
      amountAed: 300,
    })
  })

  test('customer.subscription.deleted → subscription_cancelled', () => {
    const event = {
      id: 'evt_4',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_42' } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'subscription_cancelled',
      rawId: 'evt_4',
      subscriptionRef: 'sub_42',
    })
  })

  test('charge.refunded → refunded with last refund details and fullyRefunded flag', () => {
    const event = {
      id: 'evt_5',
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent: 'pi_99',
          refunded: true,
          refunds: { data: [{ id: 're_1', amount: 25000, reason: 'requested_by_customer' }] },
        },
      },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'refunded',
      rawId: 'evt_5',
      paymentRef: 'pi_99',
      refundRef: 're_1',
      amountAed: 250,
      fullyRefunded: true,
      reason: 'requested_by_customer',
    })
  })

  test('unknown event type → unknown with rawId', () => {
    expect(provider().translate({ id: 'evt_x', type: 'customer.created', data: { object: {} } }))
      .toEqual({ kind: 'unknown', rawId: 'evt_x' })
  })
})
