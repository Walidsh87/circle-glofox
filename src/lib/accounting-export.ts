export type InvoiceRecord = {
  invoice_number: string
  issued_at: string
  customer_name_snapshot: string | null
  customer_email_snapshot: string | null
  description: string | null
  subtotal_aed: number | string
  vat_rate: number | string
  vat_aed: number | string
  total_aed: number | string
  trn_snapshot: string | null
}

export const ACCOUNTING_HEADERS: string[] = [
  'Invoice #',
  'Date',
  'Customer',
  'Email',
  'Description',
  'Subtotal (AED)',
  'VAT %',
  'VAT (AED)',
  'Total (AED)',
  'TRN',
]

export function fmtMoney(v: number | string): string {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

export function fmtInvoiceDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function toAccountingRow(inv: InvoiceRecord, timeZone: string): (string | number)[] {
  return [
    inv.invoice_number,
    fmtInvoiceDate(inv.issued_at, timeZone),
    inv.customer_name_snapshot ?? '',
    inv.customer_email_snapshot ?? '',
    inv.description ?? '',
    fmtMoney(inv.subtotal_aed),
    fmtMoney(inv.vat_rate),
    fmtMoney(inv.vat_aed),
    fmtMoney(inv.total_aed),
    inv.trn_snapshot ?? '',
  ]
}

export function buildAccountingExport(
  invoices: InvoiceRecord[],
  timeZone: string,
): {
  headers: string[]
  rows: (string | number)[][]
  totals: { count: number; subtotal: number; vat: number; total: number }
} {
  const rows = invoices.map((inv) => toAccountingRow(inv, timeZone))
  const totals = invoices.reduce(
    (acc, inv) => ({
      count: acc.count + 1,
      subtotal: acc.subtotal + Number(inv.subtotal_aed),
      vat: acc.vat + Number(inv.vat_aed),
      total: acc.total + Number(inv.total_aed),
    }),
    { count: 0, subtotal: 0, vat: 0, total: 0 },
  )
  return { headers: ACCOUNTING_HEADERS, rows, totals }
}

// ── Refunds (credit notes) ──────────────────────────────────────────────────
export type CreditNoteRecord = {
  credit_note_number: string
  issued_at: string
  invoice_number_snapshot: string | null
  customer_name_snapshot: string | null
  customer_email_snapshot: string | null
  reason: string | null
  subtotal_aed: number | string
  vat_rate: number | string
  vat_aed: number | string
  total_aed: number | string
}

// ── Vendor-native CSV exporters ─────────────────────────────────────────────
// Each accounting package imports a VAT-INCLUSIVE total it computes ITSELF from
// a tax code/name that must already exist in the gym's org. So every exporter
// emits the NET (tax-exclusive) line amount + a tax identifier, and lets the
// vendor add the 5%. Tax code/account strings are configurable because they
// must match what's set up in that specific org. Refund handling differs per
// vendor (Xero: negative lines in-file · Zoho: separate file · QuickBooks: not
// importable via native CSV).

const FALLBACK_DESC = 'Sale'

/** Neutralize CSV/formula injection: a cell starting with = + - @ tab or CR can
 *  execute when the file is opened in Excel/Sheets. Prefix it with an apostrophe. */
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** DD/MM/YYYY in the gym timezone (Xero + QuickBooks convention for UAE orgs). */
export function fmtDateDMY(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** Tax rate as a bare number string ("5.00" → "5", "7.5" → "7.5"). */
function pctStr(v: number | string): string {
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : ''
}

export const XERO_HEADERS: string[] = [
  '*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate',
  '*DueDate', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency',
]

export function buildXeroCsv(
  invoices: InvoiceRecord[],
  creditNotes: CreditNoteRecord[],
  timeZone: string,
  opts: { taxType?: string; accountCode?: string; currency?: string } = {},
): { headers: string[]; rows: string[][] } {
  const taxType = opts.taxType ?? '5% (VAT on Income)'
  const accountCode = opts.accountCode ?? '200'
  const currency = opts.currency ?? 'AED'

  const invoiceRows = invoices.map((inv) => {
    const d = fmtDateDMY(inv.issued_at, timeZone)
    return [
      csvSafe(inv.customer_name_snapshot ?? ''),
      csvSafe(inv.customer_email_snapshot ?? ''),
      inv.invoice_number,
      '',
      d,
      d,
      csvSafe(inv.description || FALLBACK_DESC),
      '1',
      fmtMoney(inv.subtotal_aed),
      accountCode,
      taxType,
      currency,
    ]
  })

  // Xero imports negative-amount lines as credit notes — same file.
  const creditRows = creditNotes.map((cn) => {
    const d = fmtDateDMY(cn.issued_at, timeZone)
    return [
      csvSafe(cn.customer_name_snapshot ?? ''),
      csvSafe(cn.customer_email_snapshot ?? ''),
      cn.credit_note_number,
      cn.invoice_number_snapshot ?? '',
      d,
      d,
      csvSafe('Refund: ' + (cn.reason || cn.invoice_number_snapshot || '')),
      '1',
      fmtMoney(-Number(cn.subtotal_aed)),
      accountCode,
      taxType,
      currency,
    ]
  })

  return { headers: XERO_HEADERS, rows: [...invoiceRows, ...creditRows] }
}

export const QUICKBOOKS_HEADERS: string[] = [
  'Invoice No.', 'Customer', 'Invoice Date', 'Due Date', 'Terms',
  'Item (product/service name)', 'Item Description', 'Item Quantity', 'Item Rate', 'Item Amount', 'Item Tax Code',
]

export function buildQuickBooksCsv(
  invoices: InvoiceRecord[],
  timeZone: string,
  opts: { taxCode?: string } = {},
): { headers: string[]; rows: string[][] } {
  const taxCode = opts.taxCode ?? '5% VAT'
  // QuickBooks' native CSV importer doesn't support credit notes / negatives —
  // invoices only. Refunds are entered manually (surfaced in the UI).
  const rows = invoices.map((inv) => {
    const net = fmtMoney(inv.subtotal_aed)
    return [
      inv.invoice_number,
      csvSafe(inv.customer_name_snapshot ?? ''),
      fmtDateDMY(inv.issued_at, timeZone),
      fmtDateDMY(inv.issued_at, timeZone),
      'Due on receipt',
      csvSafe(inv.description || FALLBACK_DESC),
      csvSafe(inv.description ?? ''),
      '1',
      net,
      net,
      taxCode,
    ]
  })
  return { headers: QUICKBOOKS_HEADERS, rows }
}

export const ZOHO_INVOICE_HEADERS: string[] = [
  'Invoice Number', 'Invoice Date', 'Due Date', 'Customer Name', 'Item Name', 'Item Desc',
  'Quantity', 'Item Price', 'Item Total', 'Tax Name', 'Tax Percentage', 'SubTotal', 'Total', 'Invoice Status',
]

export function buildZohoInvoicesCsv(
  invoices: InvoiceRecord[],
  timeZone: string,
  opts: { taxName?: string } = {},
): { headers: string[]; rows: string[][] } {
  const taxName = opts.taxName ?? 'Standard Rate'
  const rows = invoices.map((inv) => {
    const net = fmtMoney(inv.subtotal_aed)
    return [
      inv.invoice_number,
      fmtInvoiceDate(inv.issued_at, timeZone),
      fmtInvoiceDate(inv.issued_at, timeZone),
      csvSafe(inv.customer_name_snapshot ?? ''),
      csvSafe(inv.description || FALLBACK_DESC),
      csvSafe(inv.description ?? ''),
      '1',
      net,
      net,
      taxName,
      pctStr(inv.vat_rate),
      net,
      fmtMoney(inv.total_aed),
      'sent',
    ]
  })
  return { headers: ZOHO_INVOICE_HEADERS, rows }
}

export const ZOHO_CREDIT_NOTE_HEADERS: string[] = [
  'Credit Note Number', 'Credit Note Date', 'Customer Name', 'Reference#', 'Item Name', 'Item Desc',
  'Quantity', 'Item Price', 'Item Total', 'Tax Name', 'Tax Percentage', 'SubTotal', 'Total',
]

export function buildZohoCreditNotesCsv(
  creditNotes: CreditNoteRecord[],
  timeZone: string,
  opts: { taxName?: string } = {},
): { headers: string[]; rows: string[][] } {
  const taxName = opts.taxName ?? 'Standard Rate'
  // Zoho imports credit notes through a SEPARATE flow with POSITIVE amounts.
  const rows = creditNotes.map((cn) => {
    const net = fmtMoney(cn.subtotal_aed)
    return [
      cn.credit_note_number,
      fmtInvoiceDate(cn.issued_at, timeZone),
      csvSafe(cn.customer_name_snapshot ?? ''),
      cn.invoice_number_snapshot ?? '',
      'Refund',
      csvSafe(cn.reason ?? ''),
      '1',
      net,
      net,
      taxName,
      pctStr(cn.vat_rate),
      net,
      fmtMoney(cn.total_aed),
    ]
  })
  return { headers: ZOHO_CREDIT_NOTE_HEADERS, rows }
}
