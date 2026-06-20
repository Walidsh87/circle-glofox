import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getServerT } from '@/lib/i18n/server'
import { formatDate } from '../_lib/profile-format'

export type InvoiceRow = {
  id: string
  invoice_number: string
  issued_at: string
  total_aed: number | string
  credit_notes?: { total_aed: number | string }[]
}

const rowClass = 'border-b border-line last:border-0'

/** The member's invoices with refund (credit-note) annotations. Renders nothing when empty. */
export async function InvoicesCard({ invoices }: { invoices: InvoiceRow[] | null }) {
  const t = await getServerT()
  if (!invoices || invoices.length === 0) return null
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="border-b border-line bg-surface-2 px-4 py-3">
        <span className="text-[13px] font-semibold text-ink">{t('profile.invoices.section')}</span>
      </div>
      <table className="w-full">
        <tbody>
          {invoices.map((inv) => {
            const cns = inv.credit_notes ?? []
            const refunded = cns.reduce((s, c) => s + Number(c.total_aed), 0)
            return (
              <tr key={inv.id} className={rowClass}>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="font-mono text-xs text-ink transition-colors hover:text-accent-ink"
                  >
                    {inv.invoice_number}
                  </Link>
                  {refunded > 0 && (
                    <Badge tone="warn" className="ms-2 text-[10.5px]">
                      {refunded >= Number(inv.total_aed) - 0.001 ? t('profile.invoices.refunded') : t('profile.invoices.partialRefund')}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-end">
                  <span className="font-mono text-xs text-ink-3">{formatDate(inv.issued_at)}</span>
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  <span className="text-[13px] font-semibold text-ink">AED {Number(inv.total_aed).toFixed(2)}</span>
                  {refunded > 0 && <div className="text-[11px] text-warn">−AED {refunded.toFixed(2)}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
