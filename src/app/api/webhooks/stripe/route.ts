import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deriveVatFromInclusive, formatCreditNoteNumber, formatInvoiceNumber } from '@/lib/invoices'
import { decideAfterFailedCharge, resetAfterSuccess } from '@/lib/dunning'
import { sendCardFailedEmail } from '@/lib/email'
import { signPortalToken } from '@/lib/portal-token'
import { findProviderForIncomingWebhook, type NormalisedEvent } from '@/lib/psp'
import { resolveLocale } from '@/lib/i18n'
import { todayInTimezone } from '@/lib/timezone'
import { convertLeadCore } from '@/lib/convert-lead'
import { env } from '@/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // cap a hung handler (webhooks finish in <5s); bounds runaway cost

const service = createServiceClient()

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
  await service.from('memberships').update(update).eq('id', membership.id)

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
    }
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  // One-off quote (no membership) → the 75a handler. Subscription quotes carry a
  // membershipId and fall through to the membership branch below.
  if (event.quoteId && !event.membershipId) {
    return handleQuotePayment(boxId, event)
  }

  // Package one-shot purchase → grant credits + issue invoice.
  if (event.packageId && event.athleteId && event.paymentRef) {
    return grantPackageCredits(boxId, event)
  }

  // Program-template one-shot purchase → instantiate the buyer's drip copy + invoice.
  if (event.programTemplateId && event.athleteId && event.paymentRef) {
    return instantiateProgram(boxId, event)
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

async function grantPackageCredits(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  const paymentRef = event.paymentRef as string
  const packageId = event.packageId as string
  const athleteId = event.athleteId as string

  if (!(await claimEvent(boxId, event.rawId, 'package_purchased'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Idempotency: the credit batch's provider_charge_ref is UNIQUE.
  const { data: alreadyGranted } = await service
    .from('package_credits')
    .select('id')
    .eq('provider_charge_ref', paymentRef)
    .maybeSingle()
  if (alreadyGranted) return NextResponse.json({ received: true, duplicate: true })

  const { data: pkg } = await service
    .from('packages')
    .select('name, type, credit_count, price_aed, expiry_days')
    .eq('id', packageId)
    .eq('box_id', boxId)
    .single()
  if (!pkg) return NextResponse.json({ received: true })

  const { data: athlete } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .single()

  const kind = pkg.type === 'pt_block' ? 'pt_session' : 'class'
  const expiresAt = pkg.expiry_days
    ? new Date(Date.now() + Number(pkg.expiry_days) * 86_400_000).toISOString().slice(0, 10)
    : null
  const amountAed = event.amountAed ?? Number(pkg.price_aed)

  const invoiceId = await issueInvoice({
    boxId,
    membershipId: null,
    athleteId,
    customerName: athlete?.full_name ?? null,
    customerEmail: athlete?.email ?? null,
    description: pkg.name,
    amountAed,
    // One-shot packages have no Stripe invoice (in_xxx) or charge.succeeded
    // backfill, so the payment_intent doubles as both refs: provider_payment_ref
    // drives refund lookup, and provider_charge_ref gives invoice-level
    // idempotency (dedup if a retry slips past the gates above before the
    // package_credits row lands).
    chargeRef: paymentRef,
    paymentRef,
  })

  const { error: creditErr } = await service.from('package_credits').insert({
    box_id: boxId,
    athlete_id: athleteId,
    package_id: packageId,
    kind,
    credits_total: pkg.credit_count,
    credits_remaining: pkg.credit_count,
    expires_at: expiresAt,
    invoice_id: invoiceId,
    provider_charge_ref: paymentRef,
  })
  // 23505 = a concurrent delivery already granted this batch (unique
  // provider_charge_ref) — safe to treat as success. Any other error means the
  // athlete paid but got no credits: log + 500 so Stripe retries the delivery.
  if (creditErr && creditErr.code !== '23505') {
    console.error('package_credits insert failed (will retry):', creditErr)
    return NextResponse.json({ error: 'grant failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function instantiateProgram(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  const templateId = event.programTemplateId as string
  const athleteId = event.athleteId as string
  const paymentRef = event.paymentRef as string

  if (!(await claimEvent(boxId, event.rawId, 'program_purchased'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Second idempotency layer: an ACTIVE copy of this template already exists → done.
  const { data: existing } = await service
    .from('member_programs')
    .select('id')
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
    .eq('source_template_id', templateId)
    .eq('is_template', false)
    .eq('active', true)
    .maybeSingle()
  if (existing) return NextResponse.json({ received: true, duplicate: true })

  // Read the template tree (box-scoped — service client bypasses RLS).
  const { data: tpl } = await service
    .from('member_programs')
    .select('title, notes, created_by')
    .eq('id', templateId)
    .eq('box_id', boxId)
    .eq('is_template', true)
    .single()
  if (!tpl) return NextResponse.json({ received: true })

  const { data: box } = await service.from('boxes').select('timezone').eq('id', boxId).single()
  const today = todayInTimezone((box as { timezone?: string } | null)?.timezone ?? 'Asia/Dubai')

  const { data: sessionRows } = await service
    .from('program_sessions')
    .select('id, position, title, week')
    .eq('program_id', templateId)
    .eq('box_id', boxId)
    .order('position')
  const tplSessions = (sessionRows ?? []) as { id: string; position: number; title: string; week: number | null }[]
  const tplSessionIds = tplSessions.map((s) => s.id)

  const { data: exerciseRows } = tplSessionIds.length
    ? await service
        .from('program_exercises')
        .select('session_id, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds')
        .in('session_id', tplSessionIds)
        .eq('box_id', boxId)
        .order('position')
    : { data: [] as Record<string, unknown>[] }
  const tplExercises = (exerciseRows ?? []) as Record<string, unknown>[]

  // Invoice first (a paid member always gets a VAT invoice; deduped on paymentRef).
  const { data: athlete } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .single()
  const invoiceId = await issueInvoice({
    boxId,
    membershipId: null,
    athleteId,
    customerName: (athlete as { full_name?: string } | null)?.full_name ?? null,
    customerEmail: (athlete as { email?: string } | null)?.email ?? null,
    description: (tpl as { title: string }).title,
    amountAed: event.amountAed ?? 0,
    chargeRef: paymentRef,
    paymentRef,
  })
  void invoiceId

  // Instance row.
  const { data: inst, error: instErr } = await service
    .from('member_programs')
    .insert({
      box_id: boxId,
      athlete_id: athleteId,
      created_by: (tpl as { created_by: string | null }).created_by,
      title: (tpl as { title: string }).title,
      notes: (tpl as { notes: string | null }).notes,
      is_template: false,
      source_template_id: templateId,
      start_date: today,
      active: true,
    })
    .select('id')
    .single()
  if (instErr || !inst) {
    console.error('program instance insert failed (will retry):', instErr)
    return NextResponse.json({ error: 'instantiate failed' }, { status: 500 })
  }
  const newPid = (inst as { id: string }).id

  // Re-insert sessions (carry week, fresh client_uid); remap exercises to new session ids.
  const newSessionByOldId = new Map<string, string>()
  for (const s of tplSessions) {
    const { data: ns, error: nsErr } = await service
      .from('program_sessions')
      .insert({ program_id: newPid, box_id: boxId, athlete_id: athleteId, client_uid: crypto.randomUUID(), position: s.position, title: s.title, week: s.week })
      .select('id')
      .single()
    if (nsErr || !ns) {
      console.error('program session insert failed (will retry):', nsErr)
      return NextResponse.json({ error: 'instantiate failed' }, { status: 500 })
    }
    newSessionByOldId.set(s.id, (ns as { id: string }).id)
  }

  const exRows = tplExercises
    .map((e) => {
      const sid = newSessionByOldId.get(e.session_id as string)
      if (!sid) return null
      return {
        session_id: sid, box_id: boxId, athlete_id: athleteId, client_uid: crypto.randomUUID(),
        position: e.position, name: e.name, lift_name: e.lift_name, sets: e.sets, reps: e.reps,
        percentage: e.percentage, target_note: e.target_note, rest_seconds: e.rest_seconds,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (exRows.length) {
    const { error: exErr } = await service.from('program_exercises').insert(exRows)
    if (exErr) {
      console.error('program exercise insert failed (will retry):', exErr)
      return NextResponse.json({ error: 'instantiate failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}

async function handleQuotePayment(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  const quoteId = event.quoteId as string
  const paymentRef = event.paymentRef
  if (!paymentRef) return NextResponse.json({ received: true })

  if (!(await claimEvent(boxId, event.rawId, 'quote_paid'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  const { data: quote } = await service.from('quotes')
    .select('id, status, title, total_aed, buyer_name, buyer_email, athlete_id, lead_id')
    .eq('id', quoteId).eq('box_id', boxId).maybeSingle()
  if (!quote) return NextResponse.json({ received: true })
  // Only an accepted (signed) quote may be paid+provisioned. Already-paid (replay)
  // or staff-killed (void/declined/expired after checkout started) quotes are ignored.
  if (quote.status !== 'accepted') {
    return NextResponse.json({ received: true, duplicate: quote.status === 'paid' })
  }

  // Resolve the member. Prefer an existing profile with the buyer's email (the
  // "lead" may already be a member) before creating a new account — this avoids
  // charging a buyer who then gets no credits when convertLeadCore hits a duplicate
  // email, and makes a crash-retry idempotent (the profile already exists).
  let athleteId = (quote.athlete_id as string | null) ?? null
  if (!athleteId) {
    const { data: existing } = await service.from('profiles')
      .select('id').eq('box_id', boxId).eq('email', quote.buyer_email as string).maybeSingle()
    if (existing) athleteId = existing.id as string
    else if (quote.lead_id) {
      const { athleteId: converted, error } = await convertLeadCore(service, quote.lead_id as string, boxId)
      if (error) console.error('quote lead conversion failed:', error)
      else athleteId = converted
    }
  }

  // One invoice for the whole quote (dedup on paymentRef inside issueInvoice).
  const invoiceId = await issueInvoice({
    boxId, membershipId: null, athleteId,
    customerName: quote.buyer_name as string,
    customerEmail: quote.buyer_email as string,
    description: quote.title as string,
    amountAed: Number(quote.total_aed),
    chargeRef: paymentRef,
    paymentRef,
  })

  // Grant package credits for each package line (only if we have a member).
  if (athleteId) {
    const { data: lines } = await service.from('quote_line_items')
      .select('id, package_id, quantity').eq('quote_id', quoteId).eq('kind', 'package')
    for (const line of (lines ?? [])) {
      if (!line.package_id) continue
      await grantQuotePackageCredit(
        boxId, athleteId, line.package_id as string,
        Number(line.quantity), invoiceId, `${paymentRef}:${line.id}`,
      )
    }
  }

  await service.from('quotes').update({
    status: 'paid', paid_at: new Date().toISOString(),
    invoice_id: invoiceId, provider_payment_ref: paymentRef, athlete_id: athleteId,
  }).eq('id', quoteId).eq('box_id', boxId).eq('status', 'accepted')

  return NextResponse.json({ received: true })
}

async function grantQuotePackageCredit(
  boxId: string, athleteId: string, packageId: string,
  quantity: number, invoiceId: string | null, chargeRef: string,
): Promise<void> {
  const { data: pkg } = await service.from('packages')
    .select('type, credit_count, expiry_days').eq('id', packageId).eq('box_id', boxId).single()
  if (!pkg) return
  const kind = pkg.type === 'pt_block' ? 'pt_session' : 'class'
  const expiresAt = pkg.expiry_days
    ? new Date(Date.now() + Number(pkg.expiry_days) * 86_400_000).toISOString().slice(0, 10)
    : null
  const total = Number(pkg.credit_count) * quantity
  const { error } = await service.from('package_credits').insert({
    box_id: boxId, athlete_id: athleteId, package_id: packageId,
    kind, credits_total: total, credits_remaining: total,
    expires_at: expiresAt, invoice_id: invoiceId, provider_charge_ref: chargeRef,
  })
  // 23505 = a concurrent delivery already granted this line — safe.
  if (error && error.code !== '23505') console.error('quote package_credits insert failed:', error)
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
  }

  return NextResponse.json({ received: true })
}

type IssueInvoiceArgs = {
  boxId: string
  membershipId: string | null
  athleteId: string | null
  customerName: string | null
  customerEmail: string | null
  description: string
  amountAed: number
  chargeRef: string | null
  paymentRef: string | null
}

async function issueInvoice(args: IssueInvoiceArgs): Promise<string | null> {
  if (args.chargeRef) {
    const { data: existing } = await service
      .from('invoices')
      .select('id')
      .eq('provider_charge_ref', args.chargeRef)
      .maybeSingle()
    if (existing) return existing.id as string
  }

  const { data: box } = await service
    .from('boxes')
    .select('slug, trn, vat_rate, legal_name, billing_address, name')
    .eq('id', args.boxId)
    .single()
  if (!box) return null

  const vatRate = Number(box.vat_rate ?? 5)
  const { subtotalAed, vatAed, totalAed } = deriveVatFromInclusive(args.amountAed, vatRate)

  const { data: seqData, error: seqErr } = await service.rpc('next_invoice_sequence', { p_box_id: args.boxId })
  if (seqErr || typeof seqData !== 'number') return null
  const year = new Date().getFullYear()
  const invoiceNumber = formatInvoiceNumber(box.slug ?? box.name ?? '', year, seqData)

  const { data: inserted } = await service.from('invoices').insert({
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
  }).select('id').single()

  return (inserted?.id as string) ?? null
}
