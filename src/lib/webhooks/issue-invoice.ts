import { deriveVatFromInclusive, formatInvoiceNumber } from '@/lib/invoices'
import type { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

export type IssueInvoiceArgs = {
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

/**
 * Issue a VAT invoice for a paid event. Idempotent on chargeRef (box-scoped dedup):
 * returns an existing invoice id on replay, the new id on success, or null on failure.
 * Extracted from the Stripe webhook route; the service (RLS-bypassing) client is passed
 * in so the caller owns its lifecycle and the query stays box-scoped via args.boxId.
 */
export async function issueInvoice(service: ServiceClient, args: IssueInvoiceArgs): Promise<string | null> {
  if (args.chargeRef) {
    const { data: existing } = await service
      .from('invoices')
      .select('id')
      .eq('provider_charge_ref', args.chargeRef)
      .eq('box_id', args.boxId)
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
