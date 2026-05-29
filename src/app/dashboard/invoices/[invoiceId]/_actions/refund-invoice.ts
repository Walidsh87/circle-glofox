'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { deriveVatFromInclusive, formatCreditNoteNumber, validateRefund } from '@/lib/invoices'
import { getProviderForBox } from '@/lib/psp'

type Result = { error: string | null; creditNoteId?: string }

export async function refundInvoice(
  invoiceId: string,
  amountAed: number,
  reason: string,
): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can issue refunds.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: invoice } = await service
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('box_id', profile.box_id)
    .single()
  if (!invoice) return { error: 'Invoice not found.' }

  const { data: priorNotes } = await service
    .from('credit_notes')
    .select('total_aed')
    .eq('invoice_id', invoiceId)
  const alreadyRefunded = (priorNotes ?? []).reduce((s, r) => s + Number(r.total_aed), 0)

  const totalAed = Number(invoice.total_aed)
  const validationError = validateRefund(amountAed, totalAed, alreadyRefunded)
  if (validationError) return { error: validationError }

  if (!invoice.provider_payment_ref) return { error: 'No payment reference on this invoice.' }

  // Deterministic key: identical concurrent requests collapse to one refund.
  // 30-second bucket protects against double-clicks while letting genuinely new
  // refunds (e.g. partial refunds issued later) proceed normally.
  const idempotencyKey = `refund-${invoiceId}-${Math.round(amountAed * 100)}-${Math.floor(Date.now() / 30000)}`

  let refundRef: string
  try {
    const provider = await getProviderForBox(profile.box_id)
    const result = await provider.refund({
      paymentRef: invoice.provider_payment_ref,
      amountAed,
      metadata: { invoice_id: invoiceId, reason: reason.slice(0, 500) || '' },
      idempotencyKey,
    })
    refundRef = result.refundRef
  } catch (e) {
    console.error('refund call failed:', e)
    return { error: 'The payment provider could not process this refund.' }
  }

  // Idempotency safety net: if webhook beat us, exit clean.
  const { data: existingNote } = await service
    .from('credit_notes')
    .select('id')
    .eq('provider_refund_ref', refundRef)
    .maybeSingle()
  if (existingNote) {
    revalidatePath(`/dashboard/invoices/${invoiceId}`)
    return { error: null, creditNoteId: existingNote.id }
  }

  const { data: box } = await service
    .from('boxes')
    .select('slug')
    .eq('id', profile.box_id)
    .single()

  const vatRate = Number(invoice.vat_rate)
  const { subtotalAed, vatAed } = deriveVatFromInclusive(amountAed, vatRate)

  const { data: seqData, error: seqErr } = await service.rpc('next_credit_note_sequence', { p_box_id: profile.box_id })
  if (seqErr || typeof seqData !== 'number') return { error: 'Could not allocate credit note number.' }
  const sequence = seqData as number
  const year = new Date().getFullYear()
  const creditNoteNumber = formatCreditNoteNumber(box?.slug ?? '', year, sequence)

  const { data: inserted, error: insertErr } = await service
    .from('credit_notes')
    .insert({
      box_id: profile.box_id,
      invoice_id: invoiceId,
      athlete_id: invoice.athlete_id,
      sequence,
      credit_note_number: creditNoteNumber,
      subtotal_aed: subtotalAed,
      vat_rate: vatRate,
      vat_aed: vatAed,
      total_aed: Math.round(amountAed * 100) / 100,
      reason: reason.trim() || null,
      refunded_by: user.id,
      trn_snapshot: invoice.trn_snapshot,
      legal_name_snapshot: invoice.legal_name_snapshot,
      billing_address_snapshot: invoice.billing_address_snapshot,
      customer_name_snapshot: invoice.customer_name_snapshot,
      customer_email_snapshot: invoice.customer_email_snapshot,
      invoice_number_snapshot: invoice.invoice_number,
      provider_refund_ref: refundRef,
    })
    .select('id')
    .single()

  if (insertErr) {
    // 23505 = unique violation on provider_refund_ref → concurrent request beat
    // us to it. Look up the credit note it created and return success pointing
    // to that, since the actual refund only happened once at the provider.
    if (insertErr.code === '23505') {
      const { data: existing } = await service
        .from('credit_notes')
        .select('id')
        .eq('provider_refund_ref', refundRef)
        .maybeSingle()
      if (existing) {
        revalidatePath(`/dashboard/invoices/${invoiceId}`)
        return { error: null, creditNoteId: existing.id }
      }
    }
    console.error('credit_note insert failed:', insertErr)
    return { error: 'Could not record the refund. Please refresh and check status.' }
  }

  const fullyRefunded = alreadyRefunded + amountAed >= totalAed - 0.001
  if (fullyRefunded && invoice.membership_id) {
    await service
      .from('memberships')
      .update({ payment_status: 'unpaid' })
      .eq('id', invoice.membership_id)
  }

  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  if (invoice.athlete_id) revalidatePath(`/dashboard/members/${invoice.athlete_id}`)
  return { error: null, creditNoteId: inserted?.id }
}
