import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { buildAccountingExport, type InvoiceRecord, type CreditNoteRecord } from '@/lib/accounting-export'
import { ExportFormats } from './_components/export-formats'

const RANGES = [30, 90, 365]
const PREVIEW_LIMIT = 100

export default async function AccountingExportPage(ctx: { searchParams: Promise<{ range?: string }> }) {
  const { supabase, profile, boxName, box } = await requireOwnerPage()
  const sp = await ctx.searchParams
  const parsed = Number(sp.range)
  const days = RANGES.includes(parsed) ? parsed : 90
  const rangeStartIso = new Date(Date.now() - days * 86400000).toISOString()
  const tz = box.timezone ?? 'Asia/Dubai'

  const [{ data: invoiceRows }, { data: creditNoteRows }] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'invoice_number, issued_at, customer_name_snapshot, customer_email_snapshot, description, subtotal_aed, vat_rate, vat_aed, total_aed, trn_snapshot',
      )
      .eq('box_id', profile.box_id)
      .gte('issued_at', rangeStartIso)
      .order('issued_at', { ascending: false }),
    supabase
      .from('credit_notes')
      .select(
        'credit_note_number, issued_at, invoice_number_snapshot, customer_name_snapshot, customer_email_snapshot, reason, subtotal_aed, vat_rate, vat_aed, total_aed',
      )
      .eq('box_id', profile.box_id)
      .gte('issued_at', rangeStartIso)
      .order('issued_at', { ascending: false }),
  ])

  const invoices = (invoiceRows ?? []) as InvoiceRecord[]
  const creditNotes = (creditNoteRows ?? []) as CreditNoteRecord[]
  const { rows, totals } = buildAccountingExport(invoices, tz)
  const refundTotal = creditNotes.reduce((s, cn) => s + Number(cn.total_aed), 0)
  const vatRate = invoices[0] ? Number(invoices[0].vat_rate) : 5

  const previewRows = rows.slice(0, PREVIEW_LIMIT)
  const hasMore = rows.length > PREVIEW_LIMIT
  const isEmpty = invoices.length === 0 && creditNotes.length === 0

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Accounting export"
    >
      <div className="max-w-5xl">
        <p className="mb-4 text-sm text-ink-2">
          Issued invoices and refunds with VAT split — import-ready for Zoho Books, Xero, or QuickBooks.
        </p>

        <div className="mb-4 flex gap-1.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/dashboard/reports/accounting?range=${d}`}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                days === d
                  ? 'border-accent-ink bg-accent-soft text-accent-ink'
                  : 'border-line bg-surface text-ink-3 hover:text-ink',
              )}
            >
              Last {d} days
            </Link>
          ))}
        </div>

        {isEmpty ? (
          <p className="text-sm text-ink-2">No invoices or refunds in this period.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">{totals.count}</span>{' '}
              {totals.count === 1 ? 'invoice' : 'invoices'} &middot; Subtotal AED{' '}
              <span className="font-semibold text-ink">{totals.subtotal.toFixed(2)}</span> &middot; VAT AED{' '}
              <span className="font-semibold text-ink">{totals.vat.toFixed(2)}</span> &middot; Total AED{' '}
              <span className="font-semibold text-ink">{totals.total.toFixed(2)}</span>
              {creditNotes.length > 0 && (
                <>
                  {' '}
                  &middot; <span className="font-semibold text-ink">{creditNotes.length}</span> refund
                  {creditNotes.length === 1 ? '' : 's'} (AED{' '}
                  <span className="font-semibold text-ink">{refundTotal.toFixed(2)}</span>)
                </>
              )}
            </p>

            <ExportFormats invoices={invoices} creditNotes={creditNotes} timeZone={tz} days={days} vatRate={vatRate} />

            {totals.count > 0 && (
              <div>
                {hasMore && (
                  <p className="mb-2 text-xs text-ink-3">
                    Showing first {PREVIEW_LIMIT} of {totals.count} invoices. Every export includes them all.
                  </p>
                )}
                <Table>
                  <thead>
                    <tr>
                      <Th>Invoice #</Th>
                      <Th>Date</Th>
                      <Th>Customer</Th>
                      <Th>Description</Th>
                      <Th className="text-right">Subtotal (AED)</Th>
                      <Th className="text-right">VAT %</Th>
                      <Th className="text-right">VAT (AED)</Th>
                      <Th className="text-right">Total (AED)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="last:[&>td]:border-0">
                        <Td className="font-mono text-xs">{row[0]}</Td>
                        <Td className="font-mono text-xs">{row[1]}</Td>
                        <Td className="font-semibold">{row[2] || <span className="text-ink-3">—</span>}</Td>
                        <Td className="text-ink-2">{row[4] || <span className="text-ink-3">—</span>}</Td>
                        <Td className="text-right font-mono text-xs">{row[5]}</Td>
                        <Td className="text-right font-mono text-xs">{row[6]}</Td>
                        <Td className="text-right font-mono text-xs">{row[7]}</Td>
                        <Td className="text-right font-mono text-xs font-semibold">{row[8]}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
