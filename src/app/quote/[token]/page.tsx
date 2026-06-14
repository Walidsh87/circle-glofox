import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { QuoteView } from './_components/quote-view'

export const dynamic = 'force-dynamic'

export default async function PublicQuotePage(ctx: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { token } = await ctx.params
  const { paid } = await ctx.searchParams
  const service = createServiceClient()

  const { data: q } = await service.from('quotes')
    .select('id, box_id, title, terms, status, buyer_name, subtotal_aed, vat_aed, total_aed, mode, plan_id')
    .eq('public_token', token).maybeSingle()
  if (!q) notFound()

  const [{ data: box }, { data: lines }, { data: plan }] = await Promise.all([
    service.from('boxes').select('name, logo_url').eq('id', q.box_id).single(),
    service.from('quote_line_items').select('id, label, quantity, line_total_aed, kind').eq('quote_id', q.id).order('sort_order'),
    q.plan_id ? service.from('membership_plans').select('name').eq('id', q.plan_id).single() : Promise.resolve({ data: null }),
  ])

  const expiredOrDead = ['declined', 'expired', 'void'].includes(q.status as string)

  return (
    <div data-theme="light" className="flex min-h-screen items-center justify-center bg-canvas p-5">
      <div className="w-full max-w-[480px] rounded-2xl border border-line bg-surface px-[26px] py-7">
        <div className="mb-[18px] flex items-center gap-3">
          {box?.logo_url && <img src={box.logo_url} alt="" width={40} height={40} className="rounded-lg object-cover" />}
          <div>
            <div className="font-display text-lg font-semibold text-ink">{box?.name ?? 'Your gym'}</div>
            <div className="text-[13px] text-ink-3">{q.title}</div>
          </div>
        </div>
        {expiredOrDead ? (
          <p className="text-[13px] text-ink-3">This quote is no longer available. Please contact the gym.</p>
        ) : (
          <QuoteView
            token={token}
            status={q.status as string}
            title={q.title as string}
            terms={(q.terms as string) ?? ''}
            buyerName={q.buyer_name as string}
            lines={(lines ?? []).map((l) => ({ ...l, line_total_aed: Number(l.line_total_aed) }))}
            subtotalAed={Number(q.subtotal_aed)}
            vatAed={Number(q.vat_aed)}
            totalAed={Number(q.total_aed)}
            paid={paid === '1' || q.status === 'paid'}
            mode={q.mode as string}
            planName={(plan?.name as string | null) ?? null}
          />
        )}
      </div>
    </div>
  )
}
