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
  if (v === null || v === undefined) return ''
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
