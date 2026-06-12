import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card, StatCard } from '@/components/ui/card'
import { Sparkline } from './_components/sparkline'
import { computeKpis, type MembershipRow } from './_lib/metrics'
import { todayInTimezone } from '@/lib/timezone'

const fmtAed = (n: number) => `${Math.round(n).toLocaleString()} AED`

export default async function KpiPage() {
  const { supabase, profile, boxName } = await requireOwnerPage()

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const today = todayInTimezone(timezone)

  const [{ data: memberships }, { data: creditRows }] = await Promise.all([
    supabase.from('memberships').select('athlete_id, monthly_price_aed, start_date, end_date, frozen_from, frozen_until, is_trial').eq('box_id', profile.box_id),
    supabase.from('package_credits').select('created_at, packages(price_aed)').eq('box_id', profile.box_id),
  ])

  const purchases = (creditRows ?? []).map((r) => {
    const pkg = Array.isArray(r.packages) ? r.packages[0] : r.packages
    return { created_at: r.created_at as string, price_aed: Number((pkg as { price_aed: number } | null)?.price_aed ?? 0) }
  })

  const { snapshot, trend } = computeKpis((memberships ?? []) as MembershipRow[], purchases, today)

  const cards: { label: string; value: string; hint: string }[] = [
    { label: 'Active members', value: String(snapshot.activeMembers), hint: 'with a live membership' },
    { label: 'MRR', value: fmtAed(snapshot.mrr), hint: 'contracted monthly recurring' },
    { label: 'ARM', value: fmtAed(snapshot.arm), hint: 'avg revenue / member (last full month)' },
    { label: 'LEG', value: `${snapshot.leg} mo`, hint: 'avg length of engagement' },
    { label: 'LTV', value: fmtAed(snapshot.ltv), hint: 'ARM × LEG' },
    { label: 'Churn', value: `${snapshot.churnPct}%`, hint: 'monthly, 3-month avg' },
  ]

  const mrrValues = trend.map((t) => t.mrr)
  const memberValues = trend.map((t) => t.members)

  return (
    <DashboardShell
      active="kpi"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Metrics that matter"
    >
      <div className="flex max-w-3xl flex-col gap-6">
        {/* KPI cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {cards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} sub={c.hint} />
          ))}
        </div>

        {/* Trend */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
          <TrendCard title="MRR · last 12 months" values={mrrValues} foot={`${fmtAed(mrrValues[0] ?? 0)} → ${fmtAed(mrrValues[mrrValues.length - 1] ?? 0)}`} />
          <TrendCard title="Members · last 12 months" values={memberValues} foot={`${memberValues[0] ?? 0} → ${memberValues[memberValues.length - 1] ?? 0}`} />
        </div>
        <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px] tracking-[0.04em] text-ink-3">
          {trend.map((t) => <span key={t.monthEnd} className="min-w-[26px]">{t.label}</span>)}
        </div>
      </div>
    </DashboardShell>
  )
}

function TrendCard({ title, values, foot }: { title: string; values: number[]; foot: string }) {
  return (
    <Card className="p-4">
      <div className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">{title}</div>
      <Sparkline values={values} />
      <div className="mt-2.5 font-mono text-xs text-ink-2">{foot}</div>
    </Card>
  )
}
