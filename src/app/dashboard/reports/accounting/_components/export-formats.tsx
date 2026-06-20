'use client'

import { useState } from 'react'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { cn } from '@/lib/utils'
import {
  buildAccountingExport,
  buildXeroCsv,
  buildQuickBooksCsv,
  buildZohoInvoicesCsv,
  buildZohoCreditNotesCsv,
  type InvoiceRecord,
  type CreditNoteRecord,
} from '@/lib/accounting-export'

type Format = 'generic' | 'xero' | 'quickbooks' | 'zoho'

const TABS: { id: Format; label: string }[] = [
  { id: 'generic', label: 'Generic' },
  { id: 'xero', label: 'Xero' },
  { id: 'quickbooks', label: 'QuickBooks' },
  { id: 'zoho', label: 'Zoho Books' },
]

const inputCls =
  'h-9 w-full max-w-[260px] rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-accent'
const labelCls = 'block text-[11.5px] font-semibold text-ink-3 mb-1'

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  )
}

export function ExportFormats({
  invoices,
  creditNotes,
  timeZone,
  days,
  vatRate,
}: {
  invoices: InvoiceRecord[]
  creditNotes: CreditNoteRecord[]
  timeZone: string
  days: number
  vatRate: number
}) {
  const [format, setFormat] = useState<Format>('generic')
  const [xeroTax, setXeroTax] = useState('5% (VAT on Income)')
  const [xeroAccount, setXeroAccount] = useState('200')
  const [qbTax, setQbTax] = useState('5% VAT')
  const [zohoTax, setZohoTax] = useState('Standard Rate')

  const refundCount = creditNotes.length
  const generic = buildAccountingExport(invoices, timeZone)

  return (
    <div className="rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="text-sm font-semibold text-ink">Export format</div>
      <p className="mt-1 text-[12.5px] leading-normal text-ink-3">
        Amounts export <strong>net</strong> of VAT — each tool adds the {vatRate}% itself from
        a tax code that must already exist in your accounting org. Confirm the tax code / account below match yours.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFormat(t.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              format === t.id
                ? 'border-accent-ink bg-accent-soft text-accent-ink'
                : 'border-line bg-surface text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {format === 'generic' && (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-ink-2">
              Plain invoice list with the VAT split — works as a manual import or accountant hand-off. Refunds are <strong>not</strong> in
              this file; pick a vendor format below to include credit notes.
            </p>
            <DownloadCsvButton
              filename={`invoices-${days}d.csv`}
              headers={generic.headers}
              rows={generic.rows}
              label="Download generic CSV"
            />
          </div>
        )}

        {format === 'xero' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              <Field label="Sales tax rate name" value={xeroTax} onChange={setXeroTax} hint="Must match a rate in Accounting → Tax rates" />
              <Field label="Revenue account code" value={xeroAccount} onChange={setXeroAccount} hint="e.g. 200 (Sales)" />
            </div>
            <p className="text-[12.5px] text-ink-2">
              At import choose <strong>“Tax amounts are: Tax Exclusive”</strong>. Refunds ({refundCount}) are included as negative lines —
              Xero imports them as credit notes.
            </p>
            <DownloadCsvButton
              filename={`xero-${days}d.csv`}
              {...buildXeroCsv(invoices, creditNotes, timeZone, { taxType: xeroTax, accountCode: xeroAccount })}
              label="Download Xero CSV"
            />
          </div>
        )}

        {format === 'quickbooks' && (
          <div className="flex flex-col gap-3">
            <Field label="VAT/tax code" value={qbTax} onChange={setQbTax} hint="Must match a tax code in your QuickBooks company" />
            {refundCount > 0 && (
              <p className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
                ⚠️ QuickBooks’ CSV import can’t take credit notes — the {refundCount} refund{refundCount === 1 ? '' : 's'} in this period
                must be entered in QuickBooks manually. Import is also capped at 100 invoices per file.
              </p>
            )}
            <DownloadCsvButton
              filename={`quickbooks-${days}d.csv`}
              {...buildQuickBooksCsv(invoices, timeZone, { taxCode: qbTax })}
              label="Download QuickBooks CSV"
            />
          </div>
        )}

        {format === 'zoho' && (
          <div className="flex flex-col gap-3">
            <Field label="Tax name" value={zohoTax} onChange={setZohoTax} hint="UAE orgs default to “Standard Rate” (5%)" />
            <p className="text-[12.5px] text-ink-2">
              Import invoices via <strong>Sales → Invoices → Import</strong>. Refunds import separately via{' '}
              <strong>Sales → Credit Notes → Import</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <DownloadCsvButton
                filename={`zoho-invoices-${days}d.csv`}
                {...buildZohoInvoicesCsv(invoices, timeZone, { taxName: zohoTax })}
                label="Download invoices CSV"
              />
              {refundCount > 0 && (
                <DownloadCsvButton
                  filename={`zoho-credit-notes-${days}d.csv`}
                  {...buildZohoCreditNotesCsv(creditNotes, timeZone, { taxName: zohoTax })}
                  label={`Download credit notes CSV (${refundCount})`}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
