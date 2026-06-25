import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deriveVatFromInclusive, formatCreditNoteNumber } from '@/lib/invoices'
import { issueInvoice } from '@/lib/webhooks/issue-invoice'
import { decideAfterFailedCharge, resetAfterSuccess } from '@/lib/dunning'
import { sendCardFailedEmail } from '@/lib/email'
import { signPortalToken } from '@/lib/portal-token'
import { findProviderForIncomingWebhook, type NormalisedEvent } from '@/lib/psp'
import { resolveLocale } from '@/lib/i18n'
import { env } from '@/env'
import { claimEvent } from '@/lib/webhooks/idempotency'
import { grantPackageCredits, instantiateProgram, handleQuotePayment } from '@/lib/webhooks/checkout-provisioning'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // cap a hung handler (webhooks finish in <5s); bounds runaway cost

type ServiceClient = ReturnType<typeof createServiceClient>
type PaidMembership = {
  id: string
  athlete_id: string
  plan_name: string
  profiles: { full_name: string | null; email: string | null } | null
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const match = await findProviderForIncomingWebhook(rawBody, req.headers)
  if (!match) return NextResponse.json({ error: 'Invalid or unrouteable webhook' }, { status: 400 })

  const { boxId, event } = match
  // Service-role client constructed per request (not a module singleton) and threaded
  // into each handler. It bypasses RLS, so every query stays box-scoped via boxId.
  const service = createServiceClient()

  switch (event.kind) {
    case 'payment_succeeded': return handlePaymentSucceeded(service, boxId, event)
    case 'payment_failed':    return handlePaymentFailed(service, boxId, event)
    case 'checkout_completed': return handleCheckoutCompleted(service, boxId, event)
    case 'subscription_cancelled': return handleSubscriptionCancelled(service, boxId, event)
    case 'refunded': return handleRefunded(service, boxId, event)
    case 'charge_succeeded': return handleChargeSucceeded(service, boxId, event)
    default: return NextResponse.json({ received: true })
  }
}

// claimEvent (idempotency gate) extracted to @/lib/webhooks/idempotency.

async function handlePaymentSucceeded(
  service: ServiceClient,
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'payment_succeeded' }>,
): Promise<NextResponse> {
  if (!(await claimEvent(service, boxId, event.rawId, 'payment_succeeded'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  // Prefer subscription ref (set by checkout.session.completed). Race condition:
  // invoice.payment_succeeded sometimes arrives before checkout.session.completed,
  // so fall back to customer ref (set when we create the Stripe customer in
  // create-checkout, before checkout even starts) and grab the most recent active
  // membership for that customer.
  let membership: PaidMembership | null = null

  if (event.subscriptionRef) {
    const { data } = await service
      .from('memberships')
      .select('id, athlete_id, plan_name, profiles:athlete_id(full_name, email)')
      .eq('provider_subscription_ref', event.subscriptionRef)
      .eq('box_id', boxId)
      .maybeSingle()
    membership = (data as PaidMembership | null) ?? null
  }

  if (!membership && event.customerRef) {
    const { data } = await service
      .from('memberships')
      .select('id, athlete_id, plan_name, profiles:athlete_id(full_name, email)')
      .eq('provider_customer_ref', event.customerRef)
      .eq('box_id', boxId)
      .is('end_date', null)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    membership = (data as PaidMembership | null) ?? null

    // Backfill the subscription ref so future events skip the fallback path
    if (membership && event.subscriptionRef) {
      await service
        .from('memberships')
        .update({ provider_subscription_ref: event.subscriptionRef })
        .eq('id', membership.id)
        .eq('box_id', boxId)
    }
  }

  if (!membership) return NextResponse.json({ received: true })

  const today = new Date().toISOString().slice(0, 10)
  await service
    .from('memberships')
    .update({ payment_status: 'paid', last_paid_date: today, ...resetAfterSuccess() })
    .eq('id', membership.id)
    .eq('box_id', boxId)

  // Backfill membership_id + amount onto the dedup row we created above
  await service
    .from('payment_events')
    .update({ membership_id: membership.id, amount_aed: event.amountAed })
    .eq('stripe_event_id', event.rawId)

  await issueInvoice(service, {
    boxId,
    membershipId: membership.id,
    athleteId: membership.athlete_id,
    customerName: membership.profiles?.full_name ?? null,
    customerEmail: membership.profiles?.email ?? null,
    description: membership.plan_name,
    amountAed: event.amountAed,
    chargeRef: event.chargeRef,
    paymentRef: event.paymentRef,
  })

  return NextResponse.json({ received: true })
}

async function handlePaymentFailed(
  service: ServiceClient,
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'payment_failed' }>,
): Promise<NextResponse> {
  if (!(await claimEvent(service, boxId, event.rawId, 'payment_failed'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (!event.subscriptionRef) return NextResponse.json({ received: true })

  const { data: membership } = await service
    .from('memberships')
    .select('id, failed_charge_attempts, monthly_price_aed, athlete_id, profiles:athlete_id(full_name, email, language)')
    .eq('provider_subscription_ref', event.subscriptionRef)
    .eq('box_id', boxId)
    .single()
  if (!membership) return NextResponse.json({ received: true })

  const { data: boxRow } = await service
    .from('boxes')
    .select('name, max_payment_retries')
    .eq('id', boxId)
    .single()
  const maxRetries = Number(boxRow?.max_payment_retries ?? 3)

  const decision = decideAfterFailedCharge(
    Number((membership as { failed_charge_attempts?: number }).failed_charge_attempts ?? 0),
    maxRetries,
  )

  const update: Record<string, unknown> = {
    failed_charge_attempts: decision.newAttemptCount,
    last_failed_at: new Date().toISOString(),
  }
  if (decision.markOverdue) update.payment_status = 'overdue'
  await service.from('memberships').update(update).eq('id', membership.id).eq('box_id', boxId)

  await service
    .from('payment_events')
    .update({ membership_id: membership.id })
    .eq('stripe_event_id', event.rawId)

  if (decision.sendEmail) {
    const profile = (membership as { profiles?: { full_name?: string; email?: string } | null }).profiles
    if (profile?.email) {
      const baseUrl = env.NEXT_PUBLIC_APP_URL
      const portalToken = signPortalToken(membership.id, env.PORTAL_SIGN_SECRET)
      await sendCardFailedEmail({
        to: profile.email,
        gymName: boxRow?.name ?? 'your gym',
        athleteName: profile.full_name ?? 'there',
        amountAed: event.amountAed,
        attemptCount: decision.newAttemptCount,
        maxRetries,
        updatePaymentUrl: `${baseUrl}/portal/${portalToken}`,
        locale: resolveLocale((membership as { profiles?: { language?: string | null } | null }).profiles?.language),
      })
      await service
        .from('memberships')
        .update({ last_dunning_email_at: new Date().toISOString() })
        .eq('id', membership.id)
        .eq('box_id', boxId)
    }
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(
  service: ServiceClient,
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  // One-off quote (no membership) → the 75a handler. Subscription quotes carry a
  // membershipId and fall through to the membership branch below.
  if (event.quoteId && !event.membershipId) {
    return handleQuotePayment(service, boxId, event)
  }

  // Package one-shot purchase → grant credits + issue invoice.
  if (event.packageId && event.athleteId && event.paymentRef) {
    return grantPackageCredits(service, boxId, event)
  }

  // Program-template one-shot purchase → instantiate the buyer's drip copy + invoice.
  if (event.programTemplateId && event.athleteId && event.paymentRef) {
    return instantiateProgram(service, boxId, event)
  }

  // Membership subscription checkout → backfill refs (unchanged).
  if (event.membershipId && event.subscriptionRef) {
    await service
      .from('memberships')
      .update({
        provider_subscription_ref: event.subscriptionRef,
        ...(event.customerRef ? { provider_customer_ref: event.customerRef } : {}),
      })
      .eq('id', event.membershipId)
      .eq('box_id', boxId)

    // Subscription QUOTE → mark it paid. The first + recurring invoices ride the
    // existing invoice.payment_succeeded handler (the membership pre-exists with a
    // customer ref). Status-guarded accepted→paid, so replays are no-ops.
    if (event.quoteId) {
      await service
        .from('quotes')
        .update({ status: 'paid', paid_at: new Date().toISOString(), membership_id: event.membershipId })
        .eq('id', event.quoteId)
        .eq('box_id', boxId)
        .eq('status', 'accepted')
    }
  }
  return NextResponse.json({ received: true })
}

// grantPackageCredits / instantiateProgram / handleQuotePayment / grantQuotePackageCredit
// extracted to @/lib/webhooks/checkout-provisioning (service threaded in).

async function handleSubscriptionCancelled(
  service: ServiceClient,
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'subscription_cancelled' }>,
): Promise<NextResponse> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: membership } = await service
    .from('memberships')
    .select('id')
    .eq('provider_subscription_ref', event.subscriptionRef)
    .eq('box_id', boxId)
    .single()
  if (membership) {
    await service.from('memberships').update({ end_date: today }).eq('id', membership.id).eq('box_id', boxId)
  }
  return NextResponse.json({ received: true })
}

async function handleChargeSucceeded(
  service: ServiceClient,
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'charge_succeeded' }>,
): Promise<NextResponse> {
  // The invoice.payment_succeeded event sometimes lacks payment_intent in newer
  // Stripe API versions. The charge.succeeded event always has it, and tells us
  // which Stripe invoice (in_xxx) it relates to via charge.invoice. Backfill the
  // corresponding row so refunds work.
  if (!event.invoiceChargeRef) return NextResponse.json({ received: true })

  await service
    .from('invoices')
    .update({ provider_payment_ref: event.paymentRef })
    .eq('box_id', boxId)
    .eq('provider_charge_ref', event.invoiceChargeRef)
    .is('provider_payment_ref', null)

  return NextResponse.json({ received: true })
}

async function handleRefunded(
  service: ServiceClient,
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'refunded' }>,
): Promise<NextResponse> {
  if (!event.paymentRef) return NextResponse.json({ received: true })

  const { data: invoice } = await service
    .from('invoices')
    .select('*')
    .eq('box_id', boxId)
    .eq('provider_payment_ref', event.paymentRef)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ received: true })

  // Idempotency: skip if the server action (or a prior webhook delivery) recorded this refund
  const { data: existing } = await service
    .from('credit_notes')
    .select('id')
    .eq('provider_refund_ref', event.refundRef)
    .maybeSingle()
  if (existing) return NextResponse.json({ received: true })

  // Cap the credit note so the SUM of all credit notes never exceeds the invoice
  // total (mirrors the server-action refund guard in refund-invoice.ts). Stripe
  // normally bounds a single refund to the charge, but multiple partial /
  // out-of-order refunds could otherwise over-credit. Clamp to the remaining.
  const { data: priorNotes } = await service
    .from('credit_notes')
    .select('total_aed')
    .eq('invoice_id', invoice.id)
  const alreadyRefunded = ((priorNotes ?? []) as { total_aed: number | string }[])
    .reduce((s, n) => s + Number(n.total_aed), 0)
  const remaining = Math.round((Number(invoice.total_aed) - alreadyRefunded) * 100) / 100
  if (remaining <= 0) return NextResponse.json({ received: true }) // already fully credited
  const creditAmount = Math.min(event.amountAed, remaining)

  const { data: box } = await service.from('boxes').select('slug').eq('id', boxId).single()
  const vatRate = Number(invoice.vat_rate)
  const { subtotalAed, vatAed } = deriveVatFromInclusive(creditAmount, vatRate)

  const { data: seqData } = await service.rpc('next_credit_note_sequence', { p_box_id: boxId })
  if (typeof seqData !== 'number') return NextResponse.json({ received: true })
  const year = new Date().getFullYear()

  await service.from('credit_notes').insert({
    box_id: boxId,
    invoice_id: invoice.id,
    athlete_id: invoice.athlete_id,
    sequence: seqData,
    credit_note_number: formatCreditNoteNumber(box?.slug ?? '', year, seqData),
    subtotal_aed: subtotalAed,
    vat_rate: vatRate,
    vat_aed: vatAed,
    total_aed: creditAmount,
    reason: event.reason ?? 'Refunded via provider dashboard',
    trn_snapshot: invoice.trn_snapshot,
    legal_name_snapshot: invoice.legal_name_snapshot,
    billing_address_snapshot: invoice.billing_address_snapshot,
    customer_name_snapshot: invoice.customer_name_snapshot,
    customer_email_snapshot: invoice.customer_email_snapshot,
    invoice_number_snapshot: invoice.invoice_number,
    provider_refund_ref: event.refundRef,
  })

  if (event.fullyRefunded && invoice.membership_id) {
    await service
      .from('memberships')
      .update({ payment_status: 'unpaid' })
      .eq('id', invoice.membership_id)
      .eq('box_id', boxId)
  }

  return NextResponse.json({ received: true })
}

// issueInvoice + IssueInvoiceArgs extracted to @/lib/webhooks/issue-invoice (service threaded in).
