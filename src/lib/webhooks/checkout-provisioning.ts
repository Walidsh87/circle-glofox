import { NextResponse } from 'next/server'
import { todayInTimezone } from '@/lib/timezone'
import { convertLeadCore } from '@/lib/convert-lead'
import type { NormalisedEvent } from '@/lib/psp'
import type { createServiceClient } from '@/lib/supabase/service'
import { issueInvoice } from './issue-invoice'
import { claimEvent } from './idempotency'

type ServiceClient = ReturnType<typeof createServiceClient>
type CheckoutEvent = Extract<NormalisedEvent, { kind: 'checkout_completed' }>

// Provisioning handlers for one-shot checkout purchases (packages, programs, quotes).
// Extracted from the Stripe webhook route; the service (RLS-bypassing) client is
// threaded in so the route owns its lifecycle and every query stays box-scoped.

export async function grantPackageCredits(
  service: ServiceClient,
  boxId: string,
  event: CheckoutEvent,
): Promise<NextResponse> {
  const paymentRef = event.paymentRef as string
  const packageId = event.packageId as string
  const athleteId = event.athleteId as string

  if (!(await claimEvent(service, boxId, event.rawId, 'package_purchased'))) {
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

  const invoiceId = await issueInvoice(service, {
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

export async function instantiateProgram(
  service: ServiceClient,
  boxId: string,
  event: CheckoutEvent,
): Promise<NextResponse> {
  const templateId = event.programTemplateId as string
  const athleteId = event.athleteId as string
  const paymentRef = event.paymentRef as string

  if (!(await claimEvent(service, boxId, event.rawId, 'program_purchased'))) {
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
        .select('session_id, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds, video_url, metric')
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
  const invoiceId = await issueInvoice(service, {
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
        video_url: e.video_url, metric: e.metric,
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

export async function handleQuotePayment(
  service: ServiceClient,
  boxId: string,
  event: CheckoutEvent,
): Promise<NextResponse> {
  const quoteId = event.quoteId as string
  const paymentRef = event.paymentRef
  if (!paymentRef) return NextResponse.json({ received: true })

  if (!(await claimEvent(service, boxId, event.rawId, 'quote_paid'))) {
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
  const invoiceId = await issueInvoice(service, {
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
        service, boxId, athleteId, line.package_id as string,
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
  service: ServiceClient,
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
