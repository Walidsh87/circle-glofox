import { requireOwnerPage } from '@/lib/auth/page-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { signPortalToken } from '@/lib/portal-token'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AddMembershipForm } from './_components/add-membership-form'
import { PaymentActions } from './_components/payment-actions'
import { CreateStripePlanForm } from './_components/create-stripe-plan-form'
import { AddMembershipPlanForm } from './_components/add-membership-plan-form'
import { MembershipPlanRow } from './_components/membership-plan-row'
import { RemindersToggle } from './_components/reminders-toggle'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { isFrozenOn } from '@/lib/membership-status'

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'danger'> = {
  paid: 'ok',
  unpaid: 'warn',
  overdue: 'danger',
}

export default async function PaymentsPage() {
  const { supabase, profile, boxName } = await requireOwnerPage()

  // Service client for the one read that touches a secret column (stripe_secret_key).
  // RLS-client SELECT on that column is revoked from members by migration 019; only
  // the derived `stripeConnected` boolean is ever exposed to the page.
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
    supabase
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

  const unpaidCount = memberships?.filter((m) => m.payment_status !== 'paid').length ?? 0
  const paidCount = memberships?.filter((m) => m.payment_status === 'paid').length ?? 0
  const overdueCount = memberships?.filter((m) => m.payment_status === 'overdue').length ?? 0

  const todayIso = new Date().toISOString().slice(0, 10)
  const athletesWithTrials = [...new Set((memberships ?? []).filter((m) => m.is_trial).map((m) => m.athlete_id as string))]
  const active = memberships?.filter((m) => !m.end_date && !isFrozenOn(m, todayIso)) ?? []
  const mrr = active.reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)
  const collected = active.filter((m) => m.payment_status === 'paid').reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)
  const outstanding = active.filter((m) => m.payment_status !== 'paid').reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)

  // CSV export of the memberships table (#54)
  const membershipCsvRows = (memberships ?? []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    return [p?.full_name ?? '', m.plan_name, m.monthly_price_aed, m.start_date, m.last_paid_date, m.payment_status]
  })

  return (
    <DashboardShell
      active="payments"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Payments"
      actions={
        <>
          {unpaidCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {unpaidCount} unpaid
            </span>
          )}
          <DownloadCsvButton
            filename="memberships.csv"
            headers={['Athlete', 'Plan', 'Price (AED)', 'Start', 'Last paid', 'Status']}
            rows={membershipCsvRows}
          />
        </>
      }
    >
      {/* Revenue summary — brand-dark hero in both themes */}
      <div className="relative mb-4 overflow-hidden rounded-2xl bg-[#0A0A0A] p-5">
        <div className="absolute -right-14 -top-14 h-[200px] w-[200px] rounded-full border-2 border-[#C8F135] opacity-15" />
        <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#C8F135]">
          Revenue Summary
        </div>
        <div className="relative grid grid-cols-2 gap-4 md:grid-cols-4">
          <RevenueKpi label="MRR" value={mrr} />
          <RevenueKpi label="Collected" value={collected} accent />
          <RevenueKpi label="Outstanding" value={outstanding} warn />
          <div>
            <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#FAFAFA]/50">Active</div>
            <div className="font-mono text-2xl font-bold tracking-[-0.02em] text-[#FAFAFA]">{active.length}</div>
            <div className="mt-0.5 text-[11px] text-[#FAFAFA]/40">members</div>
          </div>
        </div>
      </div>

      {/* Status KPI strip */}
      <div className="mb-5 grid max-w-[500px] grid-cols-3 gap-3">
        <KpiCard label="Paid" value={paidCount} variant="ok" />
        <KpiCard label="Unpaid" value={unpaidCount} variant="warn" />
        <KpiCard label="Overdue" value={overdueCount} variant="danger" />
      </div>

      {/* Stripe plan creation */}
      {stripeConnected && (
        <Card className="mb-4 p-5">
          <div className="mb-3 flex items-center gap-2">
            <p className="m-0 text-[13px] font-semibold text-ink">Create Stripe plan</p>
            <Badge tone="ok">Stripe connected</Badge>
          </div>
          <p className="mb-3 text-xs text-ink-3">
            Creates a recurring monthly plan in your Stripe account. Copy the Price ID and paste it when adding a membership.
          </p>
          <CreateStripePlanForm />
        </Card>
      )}

      {/* Membership plans catalog */}
      <Card className="mb-4 p-5">
        <p className="mb-3 text-[13px] font-semibold text-ink">Membership plans</p>
        <AddMembershipPlanForm />
        {(plans?.length ?? 0) > 0 && (
          <table className="mt-3.5 w-full">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th className="px-3.5 py-1.5 font-medium">Plan</th>
                <th className="px-3.5 py-1.5 font-medium">Price</th>
                <th className="px-3.5 py-1.5 font-medium">Stripe ID</th>
                <th className="px-3.5 py-1.5 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans!.map((p) => <MembershipPlanRow key={p.id} plan={p} />)}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add membership */}
      <Card className="mb-5 p-5">
        <p className="mb-3 text-[13px] font-semibold text-ink">Add membership</p>
        <AddMembershipForm athletes={athletes ?? []} stripeConnected={stripeConnected} plans={(plans ?? []).filter((p) => p.active)} athletesWithTrials={athletesWithTrials} />
      </Card>

      {/* Recent overrides (30 days) */}
      <Card className="mb-5 overflow-hidden">
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
            const coach   = (Array.isArray(o.coach)   ? o.coach[0]   : o.coach)   as { full_name?: string } | null
            return (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-[1fr_auto] items-center gap-2.5 px-5 py-3',
                  i < (overrides ?? []).length - 1 && 'border-b border-line'
                )}
              >
                <div>
                  <div className="text-[13.5px] font-medium text-ink">{athlete?.full_name ?? 'Athlete'}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-3">
                    {o.overridden_reason} · by {coach?.full_name ?? 'Coach'}
                  </div>
                </div>
                <div className="font-mono text-[11px] text-ink-faint">
                  {o.overridden_at ? new Date(o.overridden_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
            )
          })
        )}
      </Card>

      {/* Automated reminders toggle */}
      <Card className="mb-5 flex items-center justify-between px-5 py-3.5">
        <div>
          <div className="text-[13px] font-semibold text-ink">Automated billing reminders</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">Sends 3 days before, on due, and 3 days overdue</div>
        </div>
        <RemindersToggle initialEnabled={remindersEnabled} />
      </Card>

      {/* Recent reminders sent */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <span className="text-[13px] font-semibold text-ink">Reminders sent</span>
          <span className="text-[11px] text-ink-3">last 10</span>
        </div>
        {(reminders ?? []).length === 0 ? (
          <div className="p-5 text-center text-[13px] text-ink-3">No reminders sent yet.</div>
        ) : (
          (reminders ?? []).map((r, i) => {
            const membership = (Array.isArray(r.membership) ? r.membership[0] : r.membership) as { profiles?: { full_name?: string } | { full_name?: string }[] } | null
            const athleteProfile = membership ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) : null
            const stageTone = r.stage === 'pre' ? 'ok' : r.stage === 'due' ? 'warn' : 'danger'
            return (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3',
                  i < (reminders ?? []).length - 1 && 'border-b border-line'
                )}
              >
                <div className="text-[13.5px] text-ink">{athleteProfile?.full_name ?? 'Member'}</div>
                <Badge tone={stageTone} className="font-mono uppercase">{r.stage}</Badge>
                <div className="font-mono text-[11px] text-ink-faint">
                  {new Date(r.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            )
          })
        )}
      </Card>

      {/* Memberships table */}
      <Table>
        <thead>
          <tr className="bg-surface-2">
            <Th>Athlete</Th>
            <Th>Plan</Th>
            <Th className="text-right">Price (AED)</Th>
            <Th>Start</Th>
            <Th>Last paid</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {memberships?.map((m) => {
            const athleteProfile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
            return (
              <tr key={m.id} className="last:[&>td]:border-0">
                <Td className="font-semibold">{athleteProfile?.full_name ?? '—'}</Td>
                <Td className="text-ink-2">{m.plan_name}</Td>
                <Td className="text-right">
                  <span className="font-mono text-ink-2">{m.monthly_price_aed ? `${m.monthly_price_aed}` : '—'}</span>
                </Td>
                <Td><span className="font-mono text-xs text-ink-3">{m.start_date}</span></Td>
                <Td><span className="font-mono text-xs text-ink-3">{m.last_paid_date ?? '—'}</span></Td>
                <Td>
                  <Badge tone={STATUS_TONES[m.payment_status] ?? 'warn'} className="capitalize">
                    <span className="mr-1 h-[5px] w-[5px] rounded-full bg-current" />
                    {m.payment_status}
                  </Badge>
                  {m.is_trial && (
                    <span className="ml-1.5 font-mono text-[10.5px] font-bold text-accent-ink">
                      Trial{m.end_date ? ` · ends ${m.end_date}` : ''}
                    </span>
                  )}
                  {isFrozenOn(m, todayIso) && (
                    <span className="ml-1.5 font-mono text-[10.5px] font-bold text-warn">❄️ Frozen</span>
                  )}
                  {m.end_date && m.end_date >= todayIso && (
                    <span className="ml-1.5 font-mono text-[10.5px] font-bold text-danger">Cancels {m.end_date}</span>
                  )}
                  {(m.failed_charge_attempts ?? 0) > 0 && (
                    <div className="mt-1 text-[10.5px] text-warn">
                      {m.failed_charge_attempts} card {m.failed_charge_attempts === 1 ? 'failure' : 'failures'}
                      {' · '}
                      <a
                        href={`/portal/${signPortalToken(m.id, process.env.PORTAL_SIGN_SECRET ?? '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink underline transition-colors hover:text-accent-ink"
                      >
                        copy update link
                      </a>
                    </div>
                  )}
                </Td>
                <Td className="text-right">
                  <PaymentActions
                    membershipId={m.id}
                    currentStatus={m.payment_status}
                    hasStripePlan={!!m.provider_plan_ref}
                    stripeConnected={stripeConnected}
                  />
                </Td>
              </tr>
            )
          })}
          {(!memberships || memberships.length === 0) && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-ink-3">
                No memberships yet.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </DashboardShell>
  )
}

function KpiCard({ label, value, variant }: { label: string; value: number; variant: 'ok' | 'warn' | 'danger' }) {
  const styles = {
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }[variant]
  return (
    <div className={cn('rounded-xl p-4', styles)}>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.06em]">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tracking-[-0.02em]">{value}</div>
    </div>
  )
}

function RevenueKpi({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  const color = accent ? 'text-[#C8F135]' : warn ? 'text-[#FF6B61]' : 'text-[#FAFAFA]'
  return (
    <div>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#FAFAFA]/50">{label}</div>
      <div className={cn('font-mono text-2xl font-bold tracking-[-0.02em]', color)}>
        {Math.round(value).toLocaleString('en-US')}
      </div>
      <div className="mt-0.5 text-[11px] text-[#FAFAFA]/40">AED / mo</div>
    </div>
  )
}
