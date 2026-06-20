import { describe, test, expect } from 'vitest'
import { deriveVatFromInclusive, formatDocumentPrefix, formatInvoiceNumber, formatCreditNoteNumber, validateRefund, validateTrn } from '@/lib/invoices'

describe('formatDocumentPrefix', () => {
  test('uppercases and strips non-alphanumerics', () => {
    expect(formatDocumentPrefix('CrossFit-DXB')).toBe('CROSSFITDXB')
    expect(formatDocumentPrefix('al quoz!')).toBe('ALQUOZ')
  })
  test('caps at 12 characters', () => {
    expect(formatDocumentPrefix('abcdefghijklmnop')).toBe('ABCDEFGHIJKL')
  })
  test('falls back to GYM for empty or all-stripped slugs', () => {
    expect(formatDocumentPrefix('')).toBe('GYM')
    expect(formatDocumentPrefix('---')).toBe('GYM')
  })
})

describe('deriveVatFromInclusive', () => {
  test('splits a 105 AED inclusive total at 5% into 100 + 5', () => {
    expect(deriveVatFromInclusive(105, 5)).toEqual({
      subtotalAed: 100,
      vatAed: 5,
      totalAed: 105,
    })
  })

  test('rounds 250 AED at 5% to 238.10 + 11.90', () => {
    expect(deriveVatFromInclusive(250, 5)).toEqual({
      subtotalAed: 238.10,
      vatAed: 11.90,
      totalAed: 250,
    })
  })

  test('zero total returns zero everywhere', () => {
    expect(deriveVatFromInclusive(0, 5)).toEqual({ subtotalAed: 0, vatAed: 0, totalAed: 0 })
  })

  test('zero VAT rate returns full amount as subtotal', () => {
    expect(deriveVatFromInclusive(100, 0)).toEqual({ subtotalAed: 100, vatAed: 0, totalAed: 100 })
  })

  test('throws on negative total', () => {
    expect(() => deriveVatFromInclusive(-1, 5)).toThrow()
  })
})

describe('formatInvoiceNumber', () => {
  test('pads sequence to 4 digits', () => {
    expect(formatInvoiceNumber('crossfit-dxb', 2026, 42)).toBe('INV-CROSSFITDXB-2026-0042')
  })

  test('strips non-alphanumeric and uppercases', () => {
    expect(formatInvoiceNumber('my gym!', 2026, 1)).toBe('INV-MYGYM-2026-0001')
  })

  test('falls back to GYM when slug is empty', () => {
    expect(formatInvoiceNumber('', 2026, 7)).toBe('INV-GYM-2026-0007')
  })

  test('truncates long slugs to 12 chars', () => {
    expect(formatInvoiceNumber('abcdefghijklmnop', 2026, 1)).toBe('INV-ABCDEFGHIJKL-2026-0001')
  })
})

describe('formatCreditNoteNumber', () => {
  test('uses CN prefix and pads sequence', () => {
    expect(formatCreditNoteNumber('crossfit-dxb', 2026, 7)).toBe('CN-CROSSFITDXB-2026-0007')
  })
})

describe('validateRefund', () => {
  test('accepts a partial refund within remaining balance', () => {
    expect(validateRefund(50, 105, 0)).toBeNull()
  })

  test('accepts full refund of remaining balance', () => {
    expect(validateRefund(105, 105, 0)).toBeNull()
  })

  test('accepts top-up refund that consumes the rest', () => {
    expect(validateRefund(55, 105, 50)).toBeNull()
  })

  test('rejects zero or negative amount', () => {
    expect(validateRefund(0, 105, 0)).toMatch(/greater than zero/)
    expect(validateRefund(-1, 105, 0)).toMatch(/greater than zero/)
  })

  test('rejects amount that overshoots remaining balance', () => {
    expect(validateRefund(60, 105, 50)).toMatch(/exceeds remaining/)
  })

  test('rejects when invoice already fully refunded', () => {
    expect(validateRefund(1, 105, 105)).toMatch(/exceeds remaining/)
  })
})

describe('validateTrn', () => {
  test('accepts a 15-digit string', () => {
    expect(validateTrn('100123456700003')).toBeNull()
  })

  test('rejects fewer than 15 digits', () => {
    expect(validateTrn('12345')).toMatch(/15 digits/)
  })

  test('rejects non-digits', () => {
    expect(validateTrn('10012345670000X')).toMatch(/15 digits/)
  })

  test('trims whitespace before validating', () => {
    expect(validateTrn('  100123456700003  ')).toBeNull()
  })
})
