'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import {
  validateQuoteDraft, computeQuoteTotals, lineTotal,
  type QuoteLineInput, type QuoteBuyerInput,
} from '@/lib/quotes'

export type CreateQuoteInput = {
  buyer: QuoteBuyerInput
  title: string
  terms: string
  validUntil: string | null
  lines: QuoteLineInput[]
}

export async function createQuote(
  input: CreateQuoteInput,
): Promise<{ error: string | null; quoteId: string | null }> {
  const auth = await requireStaffAction('Only staff can create quotes.')
  if ('error' in auth) return { error: auth.error, quoteId: null }
  const { supabase, user, profile: caller } = auth

  const { data: box } = await supabase.from('boxes').select('vat_rate').eq('id', caller.box_id).single()
  const vatRate = Number(box?.vat_rate ?? 5)

  const verr = validateQuoteDraft({
    buyer: input.buyer, title: input.title, lines: input.lines,
    validUntil: input.validUntil, vatRatePercent: vatRate, nowIso: new Date().toISOString(),
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
    if (leadErr || !newLead) return { error: leadErr?.message ?? 'Could not create the lead.', quoteId: null }
    leadId = newLead.id as string
  }
  if (!buyerEmail) return { error: 'The buyer needs an email to receive the quote.', quoteId: null }

  const { subtotalAed, vatAed, totalAed } = computeQuoteTotals(input.lines, vatRate)

  const { data: quote, error: qErr } = await supabase.from('quotes').insert({
    box_id: caller.box_id,
    athlete_id: athleteId,
    lead_id: leadId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    title: input.title.trim(),
    terms: input.terms ?? '',
    valid_until: input.validUntil,
    subtotal_aed: subtotalAed,
    vat_rate: vatRate,
    vat_aed: vatAed,
    total_aed: totalAed,
    created_by: user.id,
  }).select('id').single()
  if (qErr || !quote) return { error: qErr?.message ?? 'Could not create the quote.', quoteId: null }

  const lineRows = input.lines.map((l: QuoteLineInput, i: number) => ({
    quote_id: quote.id, box_id: caller.box_id, kind: l.kind,
    package_id: l.kind === 'package' ? (l.packageId ?? null) : null,
    label: l.label.trim(), quantity: l.quantity,
    unit_amount_aed: l.unitAmountAed, line_total_aed: lineTotal(l), sort_order: i,
  }))
  const { error: linesErr } = await supabase.from('quote_line_items').insert(lineRows)
  if (linesErr) return { error: linesErr.message, quoteId: null }

  revalidatePath('/dashboard/quotes')
  return { error: null, quoteId: quote.id as string }
}
