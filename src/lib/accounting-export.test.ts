import { describe, it, expect } from 'vitest'
import {
  fmtMoney,
  fmtInvoiceDate,
  toAccountingRow,
  buildAccountingExport,
  ACCOUNTING_HEADERS,
  type InvoiceRecord,
} from './accounting-export'

const makeInvoice = (overrides: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  invoice_number: 'INV-001',
  issued_at: '2026-03-19T10:00:00Z',
  customer_name_snapshot: 'Ahmed Al-Rashid',
  customer_email_snapshot: 'ahmed@example.com',
  description: 'Monthly membership',
  subtotal_aed: '952.38',
  vat_rate: '5.00',
  vat_aed: '47.62',
  total_aed: '1000.00',
  trn_snapshot: '100123456700003',
  ...overrides,
})

describe('fmtMoney', () => {
  it('formats a number to 2 decimal places', () => {
    expect(fmtMoney(1234.5)).toBe('1234.50')
  })

  it('formats a string decimal to 2dp', () => {
    expect(fmtMoney('952.38')).toBe('952.38')
  })

  it('rounds to 2dp', () => {
    // 99.005 in IEEE 754 may round either way — we assert it is a valid 2dp string
    const result = fmtMoney('99.005')
    expect(result).toMatch(/^99\.0[05]$/)
  })

  it('returns empty string for non-numeric string', () => {
    expect(fmtMoney('abc')).toBe('')
  })

  it('returns empty string for null-like values', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(fmtMoney(null as any)).toBe('')
  })
})

describe('fmtInvoiceDate', () => {
  it('converts a UTC timestamp to the gym timezone date', () => {
    // 2026-03-19 22:30 UTC → 2026-03-20 02:30 in Asia/Dubai (+4)
    expect(fmtInvoiceDate('2026-03-19T22:30:00Z', 'Asia/Dubai')).toBe('2026-03-20')
  })

  it('does not shift date when the UTC time is early in the day (same day)', () => {
    // 2026-03-19 10:00 UTC → 2026-03-19 14:00 in Asia/Dubai
    expect(fmtInvoiceDate('2026-03-19T10:00:00Z', 'Asia/Dubai')).toBe('2026-03-19')
  })
})

describe('toAccountingRow', () => {
  it('returns exactly 10 cells in the correct header order', () => {
    const inv = makeInvoice()
    const row = toAccountingRow(inv, 'Asia/Dubai')
    expect(row).toHaveLength(10)
    expect(row[0]).toBe('INV-001')              // Invoice #
    expect(row[1]).toBe('2026-03-19')            // Date (UTC 10:00 → Dubai 14:00 = same day)
    expect(row[2]).toBe('Ahmed Al-Rashid')       // Customer
    expect(row[3]).toBe('ahmed@example.com')     // Email
    expect(row[4]).toBe('Monthly membership')    // Description
    expect(row[5]).toBe('952.38')                // Subtotal
    expect(row[6]).toBe('5.00')                  // VAT %
    expect(row[7]).toBe('47.62')                 // VAT (AED)
    expect(row[8]).toBe('1000.00')               // Total (AED)
    expect(row[9]).toBe('100123456700003')        // TRN
  })

  it('converts null optional fields to empty string', () => {
    const inv = makeInvoice({
      customer_name_snapshot: null,
      customer_email_snapshot: null,
      description: null,
      trn_snapshot: null,
    })
    const row = toAccountingRow(inv, 'Asia/Dubai')
    expect(row[2]).toBe('')
    expect(row[3]).toBe('')
    expect(row[4]).toBe('')
    expect(row[9]).toBe('')
  })
})

describe('buildAccountingExport', () => {
  it('returns ACCOUNTING_HEADERS as headers', () => {
    const { headers } = buildAccountingExport([], 'Asia/Dubai')
    expect(headers).toEqual(ACCOUNTING_HEADERS)
  })

  it('returns empty rows and zero totals for an empty array', () => {
    const { rows, totals } = buildAccountingExport([], 'Asia/Dubai')
    expect(rows).toEqual([])
    expect(totals.count).toBe(0)
    expect(totals.subtotal).toBe(0)
    expect(totals.vat).toBe(0)
    expect(totals.total).toBe(0)
  })

  it('sums totals correctly across multiple invoices', () => {
    const invoices = [
      makeInvoice({ subtotal_aed: '952.38', vat_aed: '47.62', total_aed: '1000.00' }),
      makeInvoice({
        invoice_number: 'INV-002',
        subtotal_aed: '476.19',
        vat_aed: '23.81',
        total_aed: '500.00',
      }),
    ]
    const { totals, rows } = buildAccountingExport(invoices, 'Asia/Dubai')
    expect(totals.count).toBe(2)
    expect(totals.subtotal).toBeCloseTo(1428.57, 1)
    expect(totals.vat).toBeCloseTo(71.43, 1)
    expect(totals.total).toBeCloseTo(1500.0, 1)
    expect(rows).toHaveLength(2)
  })

  it('row count matches invoice count', () => {
    const invoices = [makeInvoice(), makeInvoice({ invoice_number: 'INV-002' }), makeInvoice({ invoice_number: 'INV-003' })]
    const { rows, totals } = buildAccountingExport(invoices, 'Asia/Dubai')
    expect(rows).toHaveLength(3)
    expect(totals.count).toBe(3)
  })
})
