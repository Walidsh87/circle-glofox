'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import {
  validateQuoteDraft, computeQuoteTotals, computeSubscriptionTotal, lineTotal,
  type QuoteLineInput, type QuoteBuyerInput, type QuoteMode,
} from '@/lib/quotes'

export type CreateQuoteInput = {
  buyer: QuoteBuyerInput
  title: string
  terms: string
  validUntil: string | null
  lines: QuoteLineInput[]
  mode?: QuoteMode
  planId?: string | null
}

export async function createQuote(
  input: CreateQuoteInput,
): Promise<{ error: string | null; quoteId: string | null }> {
  const auth = await requireStaffAction('Only staff can create quotes.')
  if ('error' in auth) return { error: auth.error, quoteId: null }
  const { supabase, user, profile: caller } = auth

  const { data: box } = await supabase.from('boxes').select('vat_rate').eq('id', caller.box_id).single()
  const vatRate = Number(box?.vat_rate ?? 5)

  const mode: QuoteMode = input.mode ?? 'one_off'
  let planRowId: string | null = null
  let planMonthly = 0
  let planName = ''
  if (mode === 'subscription') {
    const { data: plan } = await supabase.from('membership_plans')
      .select('id, name, monthly_price_aed, provider_plan_ref, is_trial, active')
      .eq('id', input.planId ?? '').eq('box_id', caller.box_id).single()
    if (!plan || !plan.active || plan.is_trial || !plan.provider_plan_ref || !(Number(plan.monthly_price_aed) > 0)) {
      return { error: 'Pick an active paid (non-trial) plan that has a Stripe price.', quoteId: null }
    }
    planRowId = plan.id as string
    planMonthly = Number(plan.monthly_price_aed)
    planName = plan.name as string
  }

  const effectiveTitle = input.title.trim() || planName

  const verr = validateQuoteDraft({
    buyer: input.buyer, title: effectiveTitle, lines: input.lines,
    validUntil: input.validUntil, vatRatePercent: vatRate, nowIso: new Date().toISOString(),
    mode, planId: input.planId ?? null, monthlyPriceAed: planMonthly,
  })
  if (verr) return { error: verr, quoteId: null }

  // Resolve the buyer → snapshot name+email, link athlete OR lead.
  let athleteId: string | null = null
  let leadId: string | null = null
  let buyerName = ''
  let buyerEmail = ''
  const b = input.buyer as Record<string, string>

  if (b.athleteId) {
    const { data: a } = await supabase.from('profiles')
      .select('full_name, email').eq('id', b.athleteId).eq('box_id', caller.box_id).single()
    if (!a) return { error: 'Member not found.', quoteId: null }
    athleteId = b.athleteId; buyerName = a.full_name ?? ''; buyerEmail = a.email ?? ''
  } else if (b.leadId) {
    const { data: l } = await supabase.from('leads')
      .select('full_name, email').eq('id', b.leadId).eq('box_id', caller.box_id).single()
    if (!l) return { error: 'Lead not found.', quoteId: null }
    leadId = b.leadId; buyerName = l.full_name ?? ''; buyerEmail = l.email ?? ''
  } else {
    buyerName = String(b.newName).trim()
    buyerEmail = String(b.newEmail).trim().toLowerCase()
    const { data: newLead, error: leadErr } = await supabase.from('leads').insert({
      box_id: caller.box_id, full_name: buyerName, email: buyerEmail, source: 'sales',
    }).select('id').single()
    if (leadErr || !newLead) {
      console.error('[createQuote]', leadErr)
      return { error: 'Could not create the lead.', quoteId: null }
    }
    leadId = newLead.id as string
  }
  if (!buyerEmail) return { error: 'The buyer needs an email to receive the quote.', quoteId: null }

  const { subtotalAed, vatAed, totalAed } = mode === 'subscription'
    ? computeSubscriptionTotal(planMonthly, vatRate)
    : computeQuoteTotals(input.lines, vatRate)

  const { data: quote, error: qErr } = await supabase.from('quotes').insert({
    box_id: caller.box_id,
    athlete_id: athleteId,
    lead_id: leadId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    title: effectiveTitle,
    mode,
    plan_id: planRowId,
    terms: input.terms ?? '',
    valid_until: input.validUntil,
    subtotal_aed: subtotalAed,
    vat_rate: vatRate,
    vat_aed: vatAed,
    total_aed: totalAed,
    created_by: user.id,
  }).select('id').single()
  if (qErr || !quote) {
    console.error('[createQuote]', qErr)
    return { error: 'Could not create the quote.', quoteId: null }
  }

  if (mode === 'one_off' && input.lines.length) {
    const lineRows = input.lines.map((l: QuoteLineInput, i: number) => ({
      quote_id: quote.id, box_id: caller.box_id, kind: l.kind,
      package_id: l.kind === 'package' ? (l.packageId ?? null) : null,
      label: l.label.trim(), quantity: l.quantity,
      unit_amount_aed: l.unitAmountAed, line_total_aed: lineTotal(l), sort_order: i,
    }))
    const { error: linesErr } = await supabase.from('quote_line_items').insert(lineRows)
    if (linesErr) {
      console.error('[createQuote]', linesErr)
      return { error: 'Could not create the quote.', quoteId: null }
    }
  }

  revalidatePath('/dashboard/quotes')
  return { error: null, quoteId: quote.id as string }
}
