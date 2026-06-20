import { describe, it, expect } from 'vitest'
import {
  fmtMoney,
  fmtInvoiceDate,
  fmtDateDMY,
  csvSafe,
  toAccountingRow,
  buildAccountingExport,
  buildXeroCsv,
  buildQuickBooksCsv,
  buildZohoInvoicesCsv,
  buildZohoCreditNotesCsv,
  ACCOUNTING_HEADERS,
  XERO_HEADERS,
  QUICKBOOKS_HEADERS,
  ZOHO_INVOICE_HEADERS,
  ZOHO_CREDIT_NOTE_HEADERS,
  type InvoiceRecord,
  type CreditNoteRecord,
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

const makeCreditNote = (overrides: Partial<CreditNoteRecord> = {}): CreditNoteRecord => ({
  credit_note_number: 'CN-001',
  issued_at: '2026-03-19T10:00:00Z',
  invoice_number_snapshot: 'INV-001',
  customer_name_snapshot: 'Ahmed Al-Rashid',
  customer_email_snapshot: 'ahmed@example.com',
  reason: 'Overcharge',
  subtotal_aed: '100.00',
  vat_rate: '5.00',
  vat_aed: '5.00',
  total_aed: '105.00',
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

  it('returns empty string for an empty string (not 0.00)', () => {
    expect(fmtMoney('')).toBe('')
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

describe('fmtDateDMY', () => {
  it('formats a UTC timestamp as DD/MM/YYYY in the gym timezone', () => {
    expect(fmtDateDMY('2026-03-19T10:00:00Z', 'Asia/Dubai')).toBe('19/03/2026')
  })

  it('rolls to the next day when the UTC time crosses midnight in-zone', () => {
    // 2026-03-19 22:30 UTC → 2026-03-20 02:30 in Asia/Dubai (+4)
    expect(fmtDateDMY('2026-03-19T22:30:00Z', 'Asia/Dubai')).toBe('20/03/2026')
  })
})

describe('csvSafe', () => {
  it.each(['=cmd', '+1', '-1', '@x', '\tx', '\rx'])('neutralizes formula-trigger cell %j', (v) => {
    expect(csvSafe(v)).toBe(`'${v}`)
  })

  it('leaves a normal value untouched', () => {
    expect(csvSafe('Ahmed Al-Rashid')).toBe('Ahmed Al-Rashid')
  })

  it('leaves an empty string untouched', () => {
    expect(csvSafe('')).toBe('')
  })
})

describe('buildXeroCsv', () => {
  it('emits the Xero header set', () => {
    expect(buildXeroCsv([], [], 'Asia/Dubai').headers).toEqual(XERO_HEADERS)
  })

  it('maps an invoice to a NET line with defaults (account 200, 5% VAT on Income, AED, DD/MM/YYYY)', () => {
    const { rows } = buildXeroCsv([makeInvoice()], [], 'Asia/Dubai')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual([
      'Ahmed Al-Rashid',
      'ahmed@example.com',
      'INV-001',
      '',
      '19/03/2026',
      '19/03/2026',
      'Monthly membership',
      '1',
      '952.38', // NET, not the 1000.00 gross — Xero adds the VAT itself
      '200',
      '5% (VAT on Income)',
      'AED',
    ])
  })

  it('emits credit notes as NEGATIVE net lines in the same file, referencing the original invoice', () => {
    const { rows } = buildXeroCsv([makeInvoice()], [makeCreditNote()], 'Asia/Dubai')
    expect(rows).toHaveLength(2)
    const cn = rows[1]
    expect(cn[2]).toBe('CN-001')
    expect(cn[3]).toBe('INV-001') // Reference → original invoice number
    expect(cn[6]).toBe('Refund: Overcharge')
    expect(cn[8]).toBe('-100.00') // negative net
  })

  it('honours configurable taxType / accountCode / currency', () => {
    const { rows } = buildXeroCsv([makeInvoice()], [], 'Asia/Dubai', {
      taxType: 'Standard Rated (5%)',
      accountCode: '201',
      currency: 'USD',
    })
    expect(rows[0][9]).toBe('201')
    expect(rows[0][10]).toBe('Standard Rated (5%)')
    expect(rows[0][11]).toBe('USD')
  })

  it('falls back to a generic description when the invoice has none', () => {
    const { rows } = buildXeroCsv([makeInvoice({ description: null })], [], 'Asia/Dubai')
    expect(rows[0][6]).toBe('Sale')
  })

  it('neutralizes CSV injection in the customer name', () => {
    const { rows } = buildXeroCsv([makeInvoice({ customer_name_snapshot: '=HYPERLINK("evil")' })], [], 'Asia/Dubai')
    expect(rows[0][0]).toBe('\'=HYPERLINK("evil")')
  })
})

describe('buildQuickBooksCsv', () => {
  it('emits the QuickBooks header set', () => {
    expect(buildQuickBooksCsv([], 'Asia/Dubai').headers).toEqual(QUICKBOOKS_HEADERS)
  })

  it('maps an invoice to a single NET line with a configurable tax code', () => {
    const { rows } = buildQuickBooksCsv([makeInvoice()], 'Asia/Dubai')
    expect(rows[0]).toEqual([
      'INV-001',
      'Ahmed Al-Rashid',
      '19/03/2026',
      '19/03/2026',
      'Due on receipt',
      'Monthly membership',
      'Monthly membership',
      '1',
      '952.38',
      '952.38',
      '5% VAT',
    ])
  })

  it('honours a configurable tax code', () => {
    const { rows } = buildQuickBooksCsv([makeInvoice()], 'Asia/Dubai', { taxCode: 'SR' })
    expect(rows[0][10]).toBe('SR')
  })
})

describe('buildZohoInvoicesCsv', () => {
  it('emits the Zoho invoice header set', () => {
    expect(buildZohoInvoicesCsv([], 'Asia/Dubai').headers).toEqual(ZOHO_INVOICE_HEADERS)
  })

  it('maps an invoice to a NET line with ISO dates and a Standard Rate / 5% tax pair', () => {
    const { rows } = buildZohoInvoicesCsv([makeInvoice()], 'Asia/Dubai')
    expect(rows[0]).toEqual([
      'INV-001',
      '2026-03-19',
      '2026-03-19',
      'Ahmed Al-Rashid',
      'Monthly membership',
      'Monthly membership',
      '1',
      '952.38',
      '952.38',
      'Standard Rate',
      '5',
      '952.38',
      '1000.00',
      'sent',
    ])
  })
})

describe('buildZohoCreditNotesCsv', () => {
  it('emits the Zoho credit-note header set', () => {
    expect(buildZohoCreditNotesCsv([], 'Asia/Dubai').headers).toEqual(ZOHO_CREDIT_NOTE_HEADERS)
  })

  it('maps a credit note to a POSITIVE line referencing the original invoice', () => {
    const { rows } = buildZohoCreditNotesCsv([makeCreditNote()], 'Asia/Dubai')
    expect(rows[0]).toEqual([
      'CN-001',
      '2026-03-19',
      'Ahmed Al-Rashid',
      'INV-001',
      'Refund',
      'Overcharge',
      '1',
      '100.00',
      '100.00',
      'Standard Rate',
      '5',
      '100.00',
      '105.00',
    ])
  })
})
