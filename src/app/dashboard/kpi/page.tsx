import { requireOwnerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { Sparkline } from './_components/sparkline'
import { computeKpis, type MembershipRow } from './_lib/metrics'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayInTimezone(timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offset * 3600000).toISOString().slice(0, 10)
}

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="kpi" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Metrics that matter
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {cards.map((c) => (
                <div key={c.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                  <div className="mono" style={{ fontSize: 26, color: 'var(--c-ink)', marginTop: 4, letterSpacing: '-0.02em', fontWeight: 700 }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-ink-muted)', marginTop: 4 }}>{c.hint}</div>
                </div>
              ))}
            </div>

            {/* Trend */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <TrendCard title="MRR · last 12 months" values={mrrValues} foot={`${fmtAed(mrrValues[0] ?? 0)} → ${fmtAed(mrrValues[mrrValues.length - 1] ?? 0)}`} />
              <TrendCard title="Members · last 12 months" values={memberValues} foot={`${memberValues[0] ?? 0} → ${memberValues[memberValues.length - 1] ?? 0}`} />
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', letterSpacing: '0.04em', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {trend.map((t) => <span key={t.monthEnd} style={{ minWidth: 26 }}>{t.label}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrendCard({ title, values, foot }: { title: string; values: number[]; foot: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{title}</div>
      <Sparkline values={values} />
      <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-2)', marginTop: 10 }}>{foot}</div>
    </div>
  )
}
