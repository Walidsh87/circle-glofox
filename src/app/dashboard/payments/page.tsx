import { requireOwnerPage } from '@/lib/auth/page-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { signPortalToken } from '@/lib/portal-token'
import { env } from '@/env'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { formatShortDate } from '@/lib/date-utils'
import { AddMembershipForm } from './_components/add-membership-form'
import { PaymentActions } from './_components/payment-actions'
import { CreateStripePlanForm } from './_components/create-stripe-plan-form'
import { AddMembershipPlanForm } from './_components/add-membership-plan-form'
import { PlanRailRow } from './_components/plan-rail-row'
import { PlansRailCard } from './_components/plans-rail-card'
import { RemindersToggle } from './_components/reminders-toggle'
import { PaymentsHeader } from './_components/payments-header'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { isFrozenOn } from '@/lib/membership-status'

const STATUS_PILL: Record<string, string> = {
  paid: 'bg-ok-soft text-ok',
  unpaid: 'bg-warn-soft text-warn',
  overdue: 'bg-danger-soft text-danger',
}

type StatusFilter = 'all' | 'paid' | 'unpaid' | 'overdue'

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams
  const statusFilter: StatusFilter = (['paid', 'unpaid', 'overdue'] as const).includes(sp.status as never)
    ? (sp.status as StatusFilter)
    : 'all'
  const { supabase, profile, boxName } = await requireOwnerPage()

  // Service client for the one read that touches a secret column (stripe_secret_key).
  const service = createServiceClient()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: memberships }, { data: athletes }, { data: box }, { data: overrides }, { data: reminders }, { data: plans }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date, frozen_from, frozen_until, is_trial, provider_plan_ref, failed_charge_attempts, last_failed_at, profiles(full_name)')
      .eq('box_id', profile.box_id)
      .order('payment_status')
      .order('start_date', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .eq('role', 'athlete')
      .order('full_name'),
    service
      .from('boxes')
      .select('stripe_secret_key, reminders_enabled')
      .eq('id', profile.box_id)
      .single(),
    // Override-audit columns (overridden_*) are revoked from the RLS client by mig 093; read
    // them via the service client, box-scoped by session.
    service
      .from('bookings')
      .select(`
        overridden_at,
        overridden_reason,
        athlete:profiles!bookings_athlete_id_fkey(full_name),
        coach:profiles!bookings_overridden_by_fkey(full_name)
      `)
      .eq('box_id', profile.box_id)
      .not('overridden_at', 'is', null)
      .gte('overridden_at', thirtyDaysAgo)
      .order('overridden_at', { ascending: false })
      .limit(10),
    supabase
      .from('billing_reminders')
      .select(`
        sent_at, stage, due_date,
        membership:memberships(profiles(full_name))
      `)
      .eq('box_id', profile.box_id)
      .order('sent_at', { ascending: false })
      .limit(10),
    supabase
      .from('membership_plans')
      .select('id, name, monthly_price_aed, provider_plan_ref, active, is_trial, trial_days')
      .eq('box_id', profile.box_id)
      .order('active', { ascending: false })
      .order('name'),
  ])

  const stripeConnected = !!(box?.stripe_secret_key)
  const remindersEnabled = box?.reminders_enabled ?? true

  const all = memberships ?? []
  const totalCount = all.length
  const unpaidCount = all.filter((m) => m.payment_status !== 'paid').length
  const paidCount = all.filter((m) => m.payment_status === 'paid').length
  const overdueCount = all.filter((m) => m.payment_status === 'overdue').length

  const shown = all.filter((m) =>
    statusFilter === 'paid' ? m.payment_status === 'paid'
      : statusFilter === 'unpaid' ? m.payment_status !== 'paid'
      : statusFilter === 'overdue' ? m.payment_status === 'overdue'
      : true
  )

  const todayIso = new Date().toISOString().slice(0, 10)
  const athletesWithTrials = [...new Set(all.filter((m) => m.is_trial).map((m) => m.athlete_id as string))]
  const active = all.filter((m) => !m.end_date && !isFrozenOn(m, todayIso))
  const mrr = active.reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)
  const collected = active.filter((m) => m.payment_status === 'paid').reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)
  const outstanding = active.filter((m) => m.payment_status !== 'paid').reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)

  // CSV export of the full memberships table (#54) — unfiltered.
  const membershipCsvRows = all.map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    return [p?.full_name ?? '', m.plan_name, m.monthly_price_aed, m.start_date, m.last_paid_date, m.payment_status]
  })

  const CHIPS: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'paid', label: 'Paid', count: paidCount },
    { key: 'unpaid', label: 'Unpaid', count: unpaidCount },
    { key: 'overdue', label: 'Overdue', count: overdueCount },
  ]
  const chipHref = (k: StatusFilter) => (k === 'all' ? '/dashboard/payments' : `/dashboard/payments?status=${k}`)
  const chipClass = (c: { key: StatusFilter; count: number }) => {
    const on = statusFilter === c.key
    if (c.key === 'all') return cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', on ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-3 hover:text-ink')
    const tone = c.key === 'paid' ? 'bg-ok-soft text-ok' : c.key === 'unpaid' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger'
    return cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', tone, on && 'ring-2 ring-current ring-offset-1 ring-offset-canvas')
  }

  return (
    <DashboardShell
      active="payments"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Payments"
    >
      <div className="mx-auto flex max-w-[1060px] flex-col gap-[18px]">
        <PaymentsHeader
          boxName={boxName}
          count={totalCount}
          unpaidCount={unpaidCount}
          exportSlot={
            <DownloadCsvButton
              filename="memberships.csv"
              headers={['Athlete', 'Plan', 'Price (AED)', 'Start', 'Last paid', 'Status']}
              rows={membershipCsvRows}
            />
          }
          addForm={<AddMembershipForm athletes={athletes ?? []} stripeConnected={stripeConnected} plans={(plans ?? []).filter((p) => p.active)} athletesWithTrials={athletesWithTrials} />}
        />

        {/* Revenue summary — brand-dark hero in both themes */}
        <div className="relative overflow-hidden rounded-2xl bg-[#0A0A0A] p-5">
          <div className="absolute -right-14 -top-14 h-[200px] w-[200px] rounded-full border-2 border-[#C8F135] opacity-15" />
          <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#C8F135]">Revenue Summary</div>
          <div className="relative grid grid-cols-2 gap-4 md:grid-cols-4">
            <RevenueKpi label="MRR" value={mrr} />
            <RevenueKpi label="Collected" value={collected} accent />
            <RevenueKpi label="Outstanding" value={outstanding} warn />
            <div>
              <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#FAFAFA]/50">Active</div>
              <div className="font-mono text-2xl font-bold tracking-[-0.02em] text-[#FAFAFA]">{active.length}</div>
              {/* /40 composites to 3.66:1 on the #0A0A0A hero — fails AA for 11px text
          (the hero is dark in BOTH themes, so no token covers it). /55 = 6.0:1. */}
      <div className="mt-0.5 text-[11px] text-[#FAFAFA]/55">members</div>
            </div>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((c) => (
            <Link key={c.key} href={chipHref(c.key)} className={chipClass(c)}>
              {c.label} · {c.count}
            </Link>
          ))}
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-ink-3">click a status to filter</span>
        </div>

        {/* Main memberships table + right rail */}
        <div className="grid gap-3.5 lg:grid-cols-[1.9fr_1fr] lg:items-start">
          {/* Memberships table */}
          {/* CSS-grid table: the ARIA roles keep the header↔cell association a
              <table> gives for free — without them a screen reader reads the
              row as a bare list of values. */}
          <div role="table" aria-label="Memberships" className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div role="row" className="grid grid-cols-[1.6fr_1.2fr_0.7fr_0.9fr_0.9fr_auto] items-center gap-3 border-b border-line bg-surface-2 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
              <span role="columnheader">Athlete</span>
              <span role="columnheader">Plan</span>
              <span role="columnheader" className="text-right">AED</span>
              <span role="columnheader">Last paid</span>
              <span role="columnheader">Status</span>
              <span role="columnheader"><span className="sr-only">Actions</span></span>
            </div>
            {shown.map((m, i) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
              const frozen = isFrozenOn(m, todayIso)
              return (
                <div
                  key={m.id}
                  role="row"
                  className={cn('grid grid-cols-[1.6fr_1.2fr_0.7fr_0.9fr_0.9fr_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2', i < shown.length - 1 && 'border-b border-line')}
                >
                  <div role="cell" className="min-w-0">
                    <Link href={`/dashboard/members/${m.athlete_id}`} className="text-[13.5px] font-semibold text-ink transition-colors hover:text-accent-ink">
                      {p?.full_name ?? '—'}
                    </Link>
                    {(m.failed_charge_attempts ?? 0) > 0 && (
                      <div className="mt-0.5 text-[10.5px] text-warn">
                        {m.failed_charge_attempts} card {m.failed_charge_attempts === 1 ? 'failure' : 'failures'} ·{' '}
                        <a
                          href={`/portal/${signPortalToken(m.id, env.PORTAL_SIGN_SECRET)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline transition-colors hover:text-ink"
                        >
                          copy update link
                        </a>
                      </div>
                    )}
                    {frozen && <div className="mt-0.5 font-mono text-[10.5px] font-bold text-warn">❄️ Frozen{m.frozen_until ? ` until ${m.frozen_until}` : ''}</div>}
                    {m.is_trial && <div className="mt-0.5 font-mono text-[10.5px] font-bold text-accent-ink">Trial{m.end_date ? ` · ends ${m.end_date}` : ''}</div>}
                    {m.end_date && m.end_date >= todayIso && <div className="mt-0.5 font-mono text-[10.5px] font-bold text-danger">Cancels {m.end_date}</div>}
                  </div>
                  <span role="cell" className="truncate text-[13px] text-ink-2">{m.plan_name}</span>
                  <span role="cell" className="text-right font-mono text-[12.5px] text-ink-2">{m.monthly_price_aed ?? '—'}</span>
                  <span role="cell" className="font-mono text-[11.5px] text-ink-3">{m.last_paid_date ?? '—'}</span>
                  <span role="cell">
                    <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold capitalize', STATUS_PILL[m.payment_status] ?? 'bg-warn-soft text-warn')}>
                      {m.payment_status}
                    </span>
                  </span>
                  <span role="cell">
                    <PaymentActions
                      membershipId={m.id}
                      currentStatus={m.payment_status}
                      hasStripePlan={!!m.provider_plan_ref}
                      stripeConnected={stripeConnected}
                    />
                  </span>
                </div>
              )
            })}
            {shown.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-ink-3">
                {totalCount === 0 ? 'No memberships yet.' : 'No memberships match this filter.'}
              </div>
            )}
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-3.5">
            <PlansRailCard
              addForm={<AddMembershipPlanForm />}
              stripeForm={stripeConnected ? <CreateStripePlanForm /> : null}
            >
              {(plans?.length ?? 0) === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-ink-3">No plans yet.</div>
              ) : (
                plans!.map((p) => <PlanRailRow key={p.id} plan={p} />)
              )}
            </PlansRailCard>

            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-ink">Automated billing reminders</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">3 days before, on due, 3 days overdue</div>
              </div>
              <RemindersToggle initialEnabled={remindersEnabled} />
            </div>

            <div className="rounded-xl border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-[13.5px] font-semibold text-ink">Reminders sent</span>
                <span className="font-mono text-[10.5px] text-ink-3">last 10</span>
              </div>
              {(reminders ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-ink-3">No reminders sent yet.</div>
              ) : (
                (reminders ?? []).map((r, i) => {
                  const membership = (Array.isArray(r.membership) ? r.membership[0] : r.membership) as { profiles?: { full_name?: string } | { full_name?: string }[] } | null
                  const athleteProfile = membership ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) : null
                  const stageTone = r.stage === 'pre' ? 'bg-ok-soft text-ok' : r.stage === 'due' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger'
                  return (
                    <div key={i} className={cn('flex items-center gap-2.5 px-4 py-2.5', i < (reminders ?? []).length - 1 && 'border-b border-line')}>
                      <span className="flex-1 truncate text-[13px] text-ink">{athleteProfile?.full_name ?? 'Member'}</span>
                      <span className={cn('font-mono text-[10px] font-semibold uppercase rounded px-1.5 py-px', stageTone)}>{r.stage}</span>
                      <span className="font-mono text-[10.5px] text-ink-3">{formatShortDate(r.sent_at)}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Recent overrides (30 days) — full width, below the grid */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <span className="text-[13px] font-semibold text-ink">Recent overrides (30 days)</span>
            <span className="text-[11px] text-ink-3">
              {(overrides ?? []).length} {(overrides ?? []).length === 1 ? 'override' : 'overrides'}
            </span>
          </div>
          {(overrides ?? []).length === 0 ? (
            <div className="p-5 text-center text-[13px] text-ink-3">No overrides in the last 30 days.</div>
          ) : (
            (overrides ?? []).map((o, i) => {
              const athlete = (Array.isArray(o.athlete) ? o.athlete[0] : o.athlete) as { full_name?: string } | null
              const coach = (Array.isArray(o.coach) ? o.coach[0] : o.coach) as { full_name?: string } | null
              return (
                <div key={i} className={cn('grid grid-cols-[1fr_auto] items-center gap-2.5 px-5 py-3', i < (overrides ?? []).length - 1 && 'border-b border-line')}>
                  <div>
                    <div className="text-[13.5px] font-medium text-ink">{athlete?.full_name ?? 'Athlete'}</div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3">{o.overridden_reason} · by {coach?.full_name ?? 'Coach'}</div>
                  </div>
                  <div className="font-mono text-[11px] text-ink-3">{o.overridden_at ? formatShortDate(o.overridden_at) : ''}</div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </DashboardShell>
  )
}

function RevenueKpi({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  const color = accent ? 'text-[#C8F135]' : warn ? 'text-[#FF6B61]' : 'text-[#FAFAFA]'
  return (
    <div>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#FAFAFA]/50">{label}</div>
      <div className={cn('font-mono text-2xl font-bold tracking-[-0.02em]', color)}>{Math.round(value).toLocaleString('en-US')}</div>
      {/* /40 composites to 3.66:1 on the #0A0A0A hero — fails AA for 11px text
          (the hero is dark in BOTH themes, so no token covers it). /55 = 6.0:1. */}
      <div className="mt-0.5 text-[11px] text-[#FAFAFA]/55">AED / mo</div>
    </div>
  )
}
