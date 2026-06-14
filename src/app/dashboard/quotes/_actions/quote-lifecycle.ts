'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import {
  validateQuoteDraft, computeQuoteTotals, lineTotal,
  canTransition, type QuoteStatus, type QuoteLineInput, type QuoteBuyerInput,
} from '@/lib/quotes'

// Edit a DRAFT quote's title/terms/validity/lines in place.
export async function updateQuote(quoteId: string, input: {
  title: string; terms: string; validUntil: string | null; lines: QuoteLineInput[]
}): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can edit quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { data: q } = await supabase.from('quotes')
    .select('id, status, athlete_id, lead_id, vat_rate').eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (q.status !== 'draft') return { error: 'Only draft quotes can be edited. Void and recreate instead.' }

  const buyer = (q.athlete_id ? { athleteId: q.athlete_id } : { leadId: q.lead_id }) as QuoteBuyerInput
  const vatRate = Number(q.vat_rate ?? 5)
  const verr = validateQuoteDraft({
    buyer, title: input.title, lines: input.lines,
    validUntil: input.validUntil, vatRatePercent: vatRate, nowIso: new Date().toISOString(),
  })
  if (verr) return { error: verr }

  const { subtotalAed, vatAed, totalAed } = computeQuoteTotals(input.lines, vatRate)
  const { error: upErr } = await supabase.from('quotes').update({
    title: input.title.trim(), terms: input.terms ?? '', valid_until: input.validUntil,
    subtotal_aed: subtotalAed, vat_aed: vatAed, total_aed: totalAed,
  }).eq('id', quoteId).eq('box_id', caller.box_id)
  if (upErr) return { error: upErr.message }

  await supabase.from('quote_line_items').delete().eq('quote_id', quoteId).eq('box_id', caller.box_id)
  const lineRows = input.lines.map((l, i) => ({
    quote_id: quoteId, box_id: caller.box_id, kind: l.kind,
    package_id: l.kind === 'package' ? (l.packageId ?? null) : null,
    label: l.label.trim(), quantity: l.quantity,
    unit_amount_aed: l.unitAmountAed, line_total_aed: lineTotal(l), sort_order: i,
  }))
  const { error: linesErr } = await supabase.from('quote_line_items').insert(lineRows)
  if (linesErr) return { error: linesErr.message }

  revalidatePath(`/dashboard/quotes/${quoteId}`)
  return { error: null }
}

export async function deleteQuote(quoteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can delete quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth
  const { data: q } = await supabase.from('quotes').select('status').eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (q.status !== 'draft') return { error: 'Only draft quotes can be deleted. Void it instead.' }
  const { error } = await supabase.from('quotes').delete().eq('id', quoteId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/quotes')
  return { error: null }
}

export async function voidQuote(quoteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can void quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth
  const { data: q } = await supabase.from('quotes').select('status').eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (!canTransition(q.status as QuoteStatus, 'void')) return { error: `A ${q.status} quote can't be voided.` }
  const { error } = await supabase.from('quotes').update({ status: 'void' }).eq('id', quoteId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/quotes')
  revalidatePath(`/dashboard/quotes/${quoteId}`)
  return { error: null }
}
