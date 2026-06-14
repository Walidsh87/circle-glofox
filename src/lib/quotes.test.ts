import { describe, it, expect } from 'vitest'
import {
  lineTotal, computeQuoteTotals, computeSubscriptionTotal, validateQuoteDraft, canTransition,
  formatQuoteNumber, isExpired, type QuoteLineInput,
} from './quotes'

const pkgLine: QuoteLineInput = { kind: 'package', packageId: 'p1', label: 'PT block', quantity: 1, unitAmountAed: 500 }

describe('lineTotal', () => {
  it('multiplies quantity by unit amount, rounded to 2dp', () => {
    expect(lineTotal({ ...pkgLine, quantity: 3, unitAmountAed: 33.33 })).toBe(99.99)
  })
})

describe('computeQuoteTotals', () => {
  it('splits VAT out of an inclusive total at 5%', () => {
    const t = computeQuoteTotals([{ ...pkgLine, unitAmountAed: 105 }], 5)
    expect(t.totalAed).toBe(105)
    expect(t.subtotalAed).toBe(100)
    expect(t.vatAed).toBe(5)
  })
  it('applies a negative discount line to the total', () => {
    const t = computeQuoteTotals([
      { ...pkgLine, unitAmountAed: 525 },
      { kind: 'discount', label: 'Ramadan promo', quantity: 1, unitAmountAed: -105 },
    ], 5)
    expect(t.totalAed).toBe(420)
  })
  it('does not throw on a non-positive total', () => {
    expect(() => computeQuoteTotals([{ kind: 'discount', label: 'x', quantity: 1, unitAmountAed: -10 }], 5)).not.toThrow()
  })
})

describe('validateQuoteDraft', () => {
  const base = {
    buyer: { athleteId: 'a1' } as const,
    title: 'PT Bundle',
    lines: [pkgLine],
    validUntil: null as string | null,
    vatRatePercent: 5,
    nowIso: '2026-06-14T10:00:00.000Z',
  }
  it('passes a valid draft', () => { expect(validateQuoteDraft(base)).toBeNull() })
  it('rejects a missing title', () => { expect(validateQuoteDraft({ ...base, title: '  ' })).toMatch(/title/i) })
  it('rejects no buyer', () => { expect(validateQuoteDraft({ ...base, buyer: {} as never })).toMatch(/who/i) })
  it('rejects a bad new-prospect email', () => {
    expect(validateQuoteDraft({ ...base, buyer: { newName: 'Sara', newEmail: 'nope' } })).toMatch(/email/i)
  })
  it('rejects zero lines', () => { expect(validateQuoteDraft({ ...base, lines: [] })).toMatch(/line/i) })
  it('rejects a package line with no packageId', () => {
    expect(validateQuoteDraft({ ...base, lines: [{ ...pkgLine, packageId: null }] })).toMatch(/package/i)
  })
  it('rejects a non-negative discount line', () => {
    expect(validateQuoteDraft({ ...base, lines: [{ kind: 'discount', label: 'd', quantity: 1, unitAmountAed: 5 }] })).toMatch(/discount/i)
  })
  it('rejects a past valid-until date', () => {
    expect(validateQuoteDraft({ ...base, validUntil: '2026-06-13' })).toMatch(/future/i)
  })
  it('rejects a total that nets to zero or below', () => {
    expect(validateQuoteDraft({ ...base, lines: [pkgLine, { kind: 'discount', label: 'd', quantity: 1, unitAmountAed: -500 }] })).toMatch(/total/i)
  })
})

describe('computeSubscriptionTotal', () => {
  it('splits VAT out of an inclusive monthly price', () => {
    const t = computeSubscriptionTotal(105, 5)
    expect(t).toEqual({ subtotalAed: 100, vatAed: 5, totalAed: 105 })
  })
  it('returns zeros for a non-positive price', () => {
    expect(computeSubscriptionTotal(0, 5)).toEqual({ subtotalAed: 0, vatAed: 0, totalAed: 0 })
  })
})

describe('validateQuoteDraft — subscription mode', () => {
  const base = {
    mode: 'subscription' as const,
    buyer: { athleteId: 'a1' } as const,
    title: 'Unlimited Monthly',
    lines: [],
    planId: 'plan-1' as string | null,
    monthlyPriceAed: 300,
    validUntil: null as string | null,
    vatRatePercent: 5,
    nowIso: '2026-06-14T10:00:00.000Z',
  }
  it('passes a valid subscription draft', () => { expect(validateQuoteDraft(base)).toBeNull() })
  it('requires a plan', () => { expect(validateQuoteDraft({ ...base, planId: null })).toMatch(/plan/i) })
  it('requires a positive monthly price', () => { expect(validateQuoteDraft({ ...base, monthlyPriceAed: 0 })).toMatch(/price/i) })
  it('rejects line items on a subscription quote', () => {
    expect(validateQuoteDraft({ ...base, lines: [{ kind: 'custom', label: 'x', quantity: 1, unitAmountAed: 5 }] })).toMatch(/no line items/i)
  })
})

describe('canTransition', () => {
  it('allows draft→sent→accepted→paid', () => {
    expect(canTransition('draft', 'sent')).toBe(true)
    expect(canTransition('sent', 'accepted')).toBe(true)
    expect(canTransition('accepted', 'paid')).toBe(true)
  })
  it('forbids illegal jumps', () => {
    expect(canTransition('draft', 'paid')).toBe(false)
    expect(canTransition('paid', 'sent')).toBe(false)
    expect(canTransition('void', 'sent')).toBe(false)
  })
})

describe('formatQuoteNumber', () => {
  it('builds QUO-{SLUG}-{YEAR}-{seq}', () => {
    expect(formatQuoteNumber('functional-fitness', 2026, 42)).toBe('QUO-FUNCTIONALFI-2026-0042')
  })
})

describe('isExpired', () => {
  it('is false for a future date and a null date', () => {
    expect(isExpired('2026-06-30', '2026-06-14T10:00:00.000Z')).toBe(false)
    expect(isExpired(null, '2026-06-14T10:00:00.000Z')).toBe(false)
  })
  it('is true once the day has fully passed', () => {
    expect(isExpired('2026-06-13', '2026-06-14T10:00:00.000Z')).toBe(true)
  })
})
