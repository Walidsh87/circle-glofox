// Pure helpers for UAE VAT invoicing. No I/O — easily unit-testable.

export type VatBreakdown = {
  subtotalAed: number
  vatAed: number
  totalAed: number
}

/**
 * Given a VAT-inclusive total (what the customer paid via Stripe) and the
 * applicable VAT rate, derive the subtotal and VAT portion.
 *
 * UAE FTA convention: prices shown to consumers are VAT-inclusive.
 * subtotal = total / (1 + rate),  vat = total - subtotal
 *
 * Why: Stripe charges the full sticker price; the invoice must split it.
 */
export function deriveVatFromInclusive(totalAed: number, vatRatePercent: number): VatBreakdown {
  if (totalAed < 0) throw new Error('totalAed must be non-negative')
  if (vatRatePercent < 0) throw new Error('vatRatePercent must be non-negative')
  const rate = vatRatePercent / 100
  const subtotal = round2(totalAed / (1 + rate))
  const vat = round2(totalAed - subtotal)
  return { subtotalAed: subtotal, vatAed: vat, totalAed: round2(totalAed) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Document-number prefix from a gym slug: uppercase, alphanumeric-only,
 * capped at 12 chars, falling back to 'GYM'. Shared by invoice / credit-note /
 * quote numbering so the rule can't drift between them.
 */
export function formatDocumentPrefix(boxSlug: string): string {
  return (boxSlug || 'GYM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'GYM'
}

/**
 * Format the human-readable invoice number.
 * Format: INV-{boxSlugUpper}-{YYYY}-{seq:0000}
 * Example: INV-CROSSFITDXB-2026-0042
 */
export function formatInvoiceNumber(boxSlug: string, year: number, sequence: number): string {
  return `INV-${formatDocumentPrefix(boxSlug)}-${year}-${String(sequence).padStart(4, '0')}`
}

/**
 * Format a credit-note number, mirroring invoice format.
 * Example: CN-CROSSFITDXB-2026-0007
 */
export function formatCreditNoteNumber(boxSlug: string, year: number, sequence: number): string {
  return `CN-${formatDocumentPrefix(boxSlug)}-${year}-${String(sequence).padStart(4, '0')}`
}

/**
 * Validate a refund request against an invoice.
 * - amount must be > 0
 * - amount + already-refunded must not exceed invoice total
 * Returns null on success, error string on failure.
 */
export function validateRefund(
  refundAmountAed: number,
  invoiceTotalAed: number,
  alreadyRefundedAed: number,
): string | null {
  if (!Number.isFinite(refundAmountAed) || refundAmountAed <= 0) {
    return 'Refund amount must be greater than zero.'
  }
  const remaining = round2(invoiceTotalAed - alreadyRefundedAed)
  if (refundAmountAed > remaining + 0.001) {
    return `Refund exceeds remaining balance (AED ${remaining.toFixed(2)}).`
  }
  return null
}

/**
 * UAE TRN validation — 15 digits.
 * Returns null on success, error string on failure.
 */
export function validateTrn(trn: string): string | null {
  const trimmed = trn.trim()
  if (!/^\d{15}$/.test(trimmed)) return 'TRN must be exactly 15 digits.'
  return null
}
