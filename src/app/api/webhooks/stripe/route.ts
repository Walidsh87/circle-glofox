import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deriveVatFromInclusive, formatCreditNoteNumber, formatInvoiceNumber } from '@/lib/invoices'
import { decideAfterFailedCharge, resetAfterSuccess } from '@/lib/dunning'
import { sendCardFailedEmail } from '@/lib/email'
import { signPortalToken } from '@/lib/portal-token'
import { findProviderForIncomingWebhook, type NormalisedEvent } from '@/lib/psp'
import { env } from '@/env'

export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const match = await findProviderForIncomingWebhook(rawBody, req.headers)
  if (!match) return NextResponse.json({ error: 'Invalid or unrouteable webhook' }, { status: 400 })

  const { boxId, event } = match

  switch (event.kind) {
    case 'payment_succeeded': return handlePaymentSucceeded(boxId, event)
    case 'payment_failed':    return handlePaymentFailed(boxId, event)
    case 'checkout_completed': return handleCheckoutCompleted(boxId, event)
    case 'subscription_cancelled': return handleSubscriptionCancelled(boxId, event)
    case 'refunded': return handleRefunded(boxId, event)
    case 'charge_succeeded': return handleChargeSucceeded(boxId, event)
    default: return NextResponse.json({ received: true })
  }
}

/**
 * Idempotency gate: write a marker row keyed on stripe_event_id (unique).
 * Returns true if we should proceed, false if this event was already handled
 * (caller should return 200 without doing more work).
 *
 * Stripe retries delivery aggressively. Without this gate, counters like
 * failed_charge_attempts can increment multiple times for a single real failure.
 */
async function claimEvent(boxId: string, eventId: string, eventType: string): Promise<boolean> {
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

async function handlePaymentSucceeded(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'payment_succeeded' }>,
): Promise<NextResponse> {
  if (!(await claimEvent(boxId, event.rawId, 'payment_succeeded'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  // Prefer subscription ref (set by checkout.session.completed). Race condition:
  // invoice.payment_succeeded sometimes arrives before checkout.session.completed,
  // so fall back to customer ref (set when we create the Stripe customer in
  // create-checkout, before checkout even starts) and grab the most recent active
  // membership for that customer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let membership: any = null

  if (event.subscriptionRef) {
    const { data } = await service
      .from('memberships')
      .select('id, athlete_id, plan_name, profiles:athlete_id(full_name, email)')
      .eq('provider_subscription_ref', event.subscriptionRef)
      .eq('box_id', boxId)
      .maybeSingle()
    membership = data ?? null
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
    membership = data ?? null

    // Backfill the subscription ref so future events skip the fallback path
    if (membership && event.subscriptionRef) {
      await service
        .from('memberships')
        .update({ provider_subscription_ref: event.subscriptionRef })
        .eq('id', membership.id)
    }
  }

  if (!membership) return NextResponse.json({ received: true })

  const today = new Date().toISOString().slice(0, 10)
  await service
    .from('memberships')
    .update({ payment_status: 'paid', last_paid_date: today, ...resetAfterSuccess() })
    .eq('id', membership.id)

  // Backfill membership_id + amount onto the dedup row we created above
  await service
    .from('payment_events')
    .update({ membership_id: membership.id, amount_aed: event.amountAed })
    .eq('stripe_event_id', event.rawId)

  await issueInvoice({
    boxId,
    membershipId: membership.id,
    athleteId: (membership as { athlete_id: string }).athlete_id,
    customerName: (membership as { profiles?: { full_name?: string } | null }).profiles?.full_name ?? null,
    customerEmail: (membership as { profiles?: { email?: string } | null }).profiles?.email ?? null,
    description: (membership as { plan_name: string }).plan_name,
    amountAed: event.amountAed,
    chargeRef: event.chargeRef,
    paymentRef: event.paymentRef,
  })

  return NextResponse.json({ received: true })
}

async function handlePaymentFailed(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'payment_failed' }>,
): Promise<NextResponse> {
  if (!(await claimEvent(boxId, event.rawId, 'payment_failed'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (!event.subscriptionRef) return NextResponse.json({ received: true })

  const { data: membership } = await service
    .from('memberships')
    .select('id, failed_charge_attempts, monthly_price_aed, athlete_id, profiles:athlete_id(full_name, email)')
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
  await service.from('memberships').update(update).eq('id', membership.id)

  await service
    .from('payment_events')
    .update({ membership_id: membership.id })
    .eq('stripe_event_id', event.rawId)

  if (decision.sendEmail) {
    const profile = (membership as { profiles?: { full_name?: string; email?: string } | null }).profiles
    if (profile?.email) {
      const baseUrl = env.NEXT_PUBLIC_APP_URL
      const portalToken = signPortalToken(membership.id, process.env.PORTAL_SIGN_SECRET ?? '')
      await sendCardFailedEmail({
        to: profile.email,
        gymName: boxRow?.name ?? 'your gym',
        athleteName: profile.full_name ?? 'there',
        amountAed: event.amountAed,
        attemptCount: decision.newAttemptCount,
        maxRetries,
        updatePaymentUrl: `${baseUrl}/portal/${portalToken}`,
      })
      await service
        .from('memberships')
        .update({ last_dunning_email_at: new Date().toISOString() })
        .eq('id', membership.id)
    }
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  if (event.membershipId && event.subscriptionRef) {
    await service
      .from('memberships')
      .update({
        provider_subscription_ref: event.subscriptionRef,
        ...(event.customerRef ? { provider_customer_ref: event.customerRef } : {}),
      })
      .eq('id', event.membershipId)
      .eq('box_id', boxId)
  }
  return NextResponse.json({ received: true })
}

async function handleSubscriptionCancelled(
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
    await service.from('memberships').update({ end_date: today }).eq('id', membership.id)
  }
  return NextResponse.json({ received: true })
}

async function handleChargeSucceeded(
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

  const { data: box } = await service.from('boxes').select('slug').eq('id', boxId).single()
  const vatRate = Number(invoice.vat_rate)
  const { subtotalAed, vatAed } = deriveVatFromInclusive(event.amountAed, vatRate)

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
    total_aed: event.amountAed,
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
  }

  return NextResponse.json({ received: true })
}

type IssueInvoiceArgs = {
  boxId: string
  membershipId: string
  athleteId: string | null
  customerName: string | null
  customerEmail: string | null
  description: string
  amountAed: number
  chargeRef: string | null
  paymentRef: string | null
}

async function issueInvoice(args: IssueInvoiceArgs) {
  if (args.chargeRef) {
    const { data: existing } = await service
      .from('invoices')
      .select('id')
      .eq('provider_charge_ref', args.chargeRef)
      .maybeSingle()
    if (existing) return
  }

  const { data: box } = await service
    .from('boxes')
    .select('slug, trn, vat_rate, legal_name, billing_address, name')
    .eq('id', args.boxId)
    .single()
  if (!box) return

  const vatRate = Number(box.vat_rate ?? 5)
  const { subtotalAed, vatAed, totalAed } = deriveVatFromInclusive(args.amountAed, vatRate)

  const { data: seqData, error: seqErr } = await service.rpc('next_invoice_sequence', { p_box_id: args.boxId })
  if (seqErr || typeof seqData !== 'number') return
  const year = new Date().getFullYear()
  const invoiceNumber = formatInvoiceNumber(box.slug ?? box.name ?? '', year, seqData)

  await service.from('invoices').insert({
    box_id: args.boxId,
    athlete_id: args.athleteId,
    membership_id: args.membershipId,
    sequence: seqData,
    invoice_number: invoiceNumber,
    subtotal_aed: subtotalAed,
    vat_rate: vatRate,
    vat_aed: vatAed,
    total_aed: totalAed,
    trn_snapshot: box.trn ?? null,
    legal_name_snapshot: box.legal_name ?? box.name ?? null,
    billing_address_snapshot: box.billing_address ?? null,
    customer_name_snapshot: args.customerName,
    customer_email_snapshot: args.customerEmail,
    description: args.description,
    provider_charge_ref: args.chargeRef,
    provider_payment_ref: args.paymentRef,
  })
}
