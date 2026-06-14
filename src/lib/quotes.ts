import { deriveVatFromInclusive } from './invoices'

export type QuoteLineKind = 'package' | 'custom' | 'discount'

export type QuoteLineInput = {
  kind: QuoteLineKind
  packageId?: string | null
  label: string
  quantity: number
  unitAmountAed: number
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'paid' | 'declined' | 'expired' | 'void'

export type QuoteMode = 'one_off' | 'subscription'

export type QuoteBuyerInput =
  | { athleteId: string }
  | { leadId: string }
  | { newName: string; newEmail: string }

export type QuoteDraftInput = {
  buyer: QuoteBuyerInput | Record<string, never>
  title: string
  lines: QuoteLineInput[]
  validUntil: string | null
  vatRatePercent: number
  nowIso: string
  mode?: QuoteMode
  planId?: string | null
  monthlyPriceAed?: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function lineTotal(line: QuoteLineInput): number {
  return round2(line.quantity * line.unitAmountAed)
}

export function computeQuoteTotals(
  lines: QuoteLineInput[],
  vatRatePercent: number,
): { subtotalAed: number; vatAed: number; totalAed: number } {
  const total = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0))
  // deriveVatFromInclusive throws on a negative amount — guard the non-positive case.
  if (total <= 0) return { subtotalAed: total, vatAed: 0, totalAed: total }
  return deriveVatFromInclusive(total, vatRatePercent)
}

export function computeSubscriptionTotal(
  monthlyPriceAed: number,
  vatRatePercent: number,
): { subtotalAed: number; vatAed: number; totalAed: number } {
  if (!(monthlyPriceAed > 0)) return { subtotalAed: 0, vatAed: 0, totalAed: 0 }
  return deriveVatFromInclusive(monthlyPriceAed, vatRatePercent)
}

export function isExpired(validUntil: string | null, nowIso: string): boolean {
  if (!validUntil) return false
  return new Date(nowIso) > new Date(`${validUntil}T23:59:59.999Z`)
}

export function validateQuoteDraft(input: QuoteDraftInput): string | null {
  if (!input.title.trim()) return 'Give the quote a title.'

  const b = input.buyer as Record<string, string>
  const hasBuyer = Boolean(b.athleteId || b.leadId || (b.newName && b.newEmail))
  if (!hasBuyer) return 'Choose who this quote is for.'
  if (b.newName !== undefined && !String(b.newName).trim()) return 'The buyer name is required.'
  if (b.newEmail !== undefined && !EMAIL_RE.test(String(b.newEmail).trim())) return 'The buyer email is not valid.'

  const mode = input.mode ?? 'one_off'
  if (mode === 'subscription') {
    if (!input.planId) return 'Choose a membership plan.'
    if (!(Number(input.monthlyPriceAed) > 0)) return 'The plan needs a monthly price.'
    if (input.lines.length) return 'A subscription quote has no line items.'
  } else {
    if (!input.lines.length) return 'Add at least one line item.'
    for (const l of input.lines) {
      if (!l.label.trim()) return 'Each line needs a label.'
      if (!Number.isFinite(l.quantity) || l.quantity < 1) return 'Quantity must be at least 1.'
      if (l.kind === 'discount') {
        if (!(l.unitAmountAed < 0)) return 'A discount line must be a negative amount.'
      } else {
        if (!(l.unitAmountAed > 0)) return 'Line amounts must be greater than zero.'
        if (l.kind === 'package' && !l.packageId) return 'Pick a package for each package line.'
      }
    }
    const { totalAed } = computeQuoteTotals(input.lines, input.vatRatePercent)
    if (totalAed <= 0) return 'The quote total must be greater than zero.'
  }

  if (input.validUntil && isExpired(input.validUntil, input.nowIso)) {
    return 'The valid-until date must be in the future.'
  }
  return null
}

const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['accepted', 'declined', 'expired', 'void'],
  accepted: ['paid', 'expired', 'void'],
  paid: [],
  declined: [],
  expired: [],
  void: [],
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function formatQuoteNumber(boxSlug: string, year: number, sequence: number): string {
  const prefix = (boxSlug || 'GYM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'GYM'
  return `QUO-${prefix}-${year}-${String(sequence).padStart(4, '0')}`
}
