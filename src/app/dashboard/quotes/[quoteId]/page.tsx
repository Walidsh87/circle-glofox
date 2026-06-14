import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { env } from '@/env'
import { QuoteDetailActions } from './_components/quote-detail-actions'

export default async function QuoteDetailPage(ctx: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await ctx.params
  const { supabase, profile, boxName } = await requireStaffPage()

  const { data: q } = await supabase.from('quotes')
    .select('id, quote_number, title, status, buyer_name, buyer_email, terms, valid_until, subtotal_aed, vat_aed, total_aed, public_token, signed_name, signed_at, invoice_id, mode, plan_id, membership_id')
    .eq('id', quoteId).eq('box_id', profile.box_id).single()
  if (!q) notFound()

  const [{ data: lines }, { data: plan }] = await Promise.all([
    supabase.from('quote_line_items').select('id, label, quantity, line_total_aed').eq('quote_id', quoteId).order('sort_order'),
    q.plan_id ? supabase.from('membership_plans').select('name').eq('id', q.plan_id).single() : Promise.resolve({ data: null }),
  ])

  const publicUrl = q.public_token ? `${env.NEXT_PUBLIC_APP_URL}/quote/${q.public_token}` : null

  return (
    <DashboardShell active="quotes" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title={q.quote_number ?? 'Draft quote'}>
      <Card className="mb-4 max-w-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-ink">{q.title}</div>
            <div className="text-[13px] text-ink-3">{q.buyer_name} — {q.buyer_email}</div>
          </div>
          <Badge tone={q.status === 'paid' ? 'ok' : 'neutral'}>{q.status}</Badge>
        </div>

        {q.mode === 'subscription' ? (
          <div className="mb-3 rounded-lg border border-line p-3 text-[13px]">
            <span className="font-semibold text-ink">{(plan?.name as string | null) ?? 'Monthly membership'}</span>
            <span className="ms-2 font-mono text-ink-3">{Number(q.total_aed).toFixed(2)} AED / month</span>
          </div>
        ) : (
          <table className="mb-3 w-full text-[13px]">
            <tbody>
              {lines?.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-1.5">{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</td>
                  <td className="py-1.5 text-end font-mono text-ink-3">{Number(l.line_total_aed).toFixed(2)} AED</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-[13px] text-ink-3">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{Number(q.subtotal_aed).toFixed(2)} AED</span></div>
          <div className="flex justify-between"><span>VAT</span><span className="font-mono">{Number(q.vat_aed).toFixed(2)} AED</span></div>
          <div className="flex justify-between font-semibold text-ink"><span>Total</span><span className="font-mono">{Number(q.total_aed).toFixed(2)} AED</span></div>
        </div>

        {q.signed_name && (
          <p className="mt-3 text-[13px] text-ink-3">Signed by <span className="font-semibold text-ink">{q.signed_name}</span>{q.signed_at ? ` on ${new Date(q.signed_at as string).toLocaleDateString()}` : ''}.</p>
        )}
        {q.invoice_id && (
          <Link href={`/dashboard/invoices/${q.invoice_id}`} className="mt-2 inline-block text-[13px] text-accent-ink underline">View invoice</Link>
        )}
        {q.membership_id && (
          <Link href="/dashboard/payments" className="mt-2 inline-block text-[13px] text-accent-ink underline">View membership</Link>
        )}
      </Card>

      <QuoteDetailActions quoteId={q.id as string} status={q.status as string} publicUrl={publicUrl} />
    </DashboardShell>
  )
}
