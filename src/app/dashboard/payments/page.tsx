import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { signPortalToken } from '@/lib/portal-token'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AddMembershipForm } from './_components/add-membership-form'
import { PaymentActions } from './_components/payment-actions'
import { CreateStripePlanForm } from './_components/create-stripe-plan-form'
import { RemindersToggle } from './_components/reminders-toggle'
import { isFrozenOn } from '@/lib/membership-status'

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  paid:    { bg: 'var(--c-ok-soft)',    color: 'var(--c-ok-ink)' },
  unpaid:  { bg: 'var(--c-warn-soft)',  color: 'var(--c-warn-ink)' },
  overdue: { bg: 'var(--c-danger-soft)', color: 'var(--c-danger-ink)' },
}

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  // Service client for the one read that touches a secret column (stripe_secret_key).
  // RLS-client SELECT on that column is revoked from members by migration 019; only
  // the derived `stripeConnected` boolean is ever exposed to the page.
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: memberships }, { data: athletes }, { data: box }, { data: overrides }, { data: reminders }] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date, frozen_from, frozen_until, provider_plan_ref, failed_charge_attempts, last_failed_at, profiles(full_name)')
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
  ])

  const stripeConnected = !!(box?.stripe_secret_key)
  const remindersEnabled = box?.reminders_enabled ?? true

  const unpaidCount = memberships?.filter((m) => m.payment_status !== 'paid').length ?? 0
  const paidCount = memberships?.filter((m) => m.payment_status === 'paid').length ?? 0
  const overdueCount = memberships?.filter((m) => m.payment_status === 'overdue').length ?? 0

  const todayIso = new Date().toISOString().slice(0, 10)
  const active = memberships?.filter((m) => !m.end_date && !isFrozenOn(m, todayIso)) ?? []
  const mrr = active.reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)
  const collected = active.filter((m) => m.payment_status === 'paid').reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)
  const outstanding = active.filter((m) => m.payment_status !== 'paid').reduce((sum, m) => sum + (Number(m.monthly_price_aed) || 0), 0)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="payments" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0, gap: 12,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            Payments
          </h1>
          {unpaidCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: 'var(--c-warn-soft)', color: 'var(--c-warn-ink)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              {unpaidCount} unpaid
            </span>
          )}
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          {/* Revenue summary */}
          <div style={{
            background: 'var(--circle-ink)', borderRadius: 16, padding: '20px 24px',
            marginBottom: 16, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: '50%', border: '2px solid var(--circle-lime)', opacity: 0.15 }} />
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Revenue Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, position: 'relative' }}>
              <RevenueKpi label="MRR" value={mrr} />
              <RevenueKpi label="Collected" value={collected} accent />
              <RevenueKpi label="Outstanding" value={outstanding} warn />
              <div>
                <div className="mono" style={{ fontSize: 10.5, color: 'rgba(250,250,250,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Active</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: '#fafafa', letterSpacing: '-0.02em' }}>{active.length}</div>
                <div style={{ fontSize: 11, color: 'rgba(250,250,250,0.4)', marginTop: 2 }}>members</div>
              </div>
            </div>
          </div>

          {/* Status KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20, maxWidth: 500 }}>
            <KpiCard label="Paid" value={paidCount} variant="ok" />
            <KpiCard label="Unpaid" value={unpaidCount} variant="warn" />
            <KpiCard label="Overdue" value={overdueCount} variant="danger" />
          </div>

          {/* Stripe plan creation */}
          {stripeConnected && (
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 14, padding: '18px 20px', marginBottom: 16,
              boxShadow: 'var(--c-shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', margin: 0 }}>Create Stripe plan</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>
                  Stripe connected
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 12 }}>
                Creates a recurring monthly plan in your Stripe account. Copy the Price ID and paste it when adding a membership.
              </p>
              <CreateStripePlanForm />
            </div>
          )}

          {/* Add membership */}
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, padding: '18px 20px', marginBottom: 20,
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Add membership</p>
            <AddMembershipForm athletes={athletes ?? []} stripeConnected={stripeConnected} />
          </div>

          {/* Recent overrides (30 days) */}
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, overflow: 'hidden', marginBottom: 20,
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>
                Recent overrides (30 days)
              </span>
              <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
                {(overrides ?? []).length} {(overrides ?? []).length === 1 ? 'override' : 'overrides'}
              </span>
            </div>
            {(overrides ?? []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                No overrides in the last 30 days.
              </div>
            ) : (
              (overrides ?? []).map((o, i) => {
                const athlete = (Array.isArray(o.athlete) ? o.athlete[0] : o.athlete) as { full_name?: string } | null
                const coach   = (Array.isArray(o.coach)   ? o.coach[0]   : o.coach)   as { full_name?: string } | null
                return (
                  <div key={i} style={{
                    padding: '12px 20px',
                    borderBottom: i < (overrides ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13.5, color: 'var(--c-ink)', fontWeight: 500 }}>
                        {athlete?.full_name ?? 'Athlete'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                        {o.overridden_reason} · by {coach?.full_name ?? 'Coach'}
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>
                      {o.overridden_at ? new Date(o.overridden_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Automated reminders toggle */}
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, padding: '14px 20px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>
                Automated billing reminders
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                Sends 3 days before, on due, and 3 days overdue
              </div>
            </div>
            <RemindersToggle initialEnabled={remindersEnabled} />
          </div>

          {/* Recent reminders sent */}
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, overflow: 'hidden', marginBottom: 20,
            boxShadow: 'var(--c-shadow-sm)',
          }}>
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>
                Reminders sent
              </span>
              <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
                last 10
              </span>
            </div>
            {(reminders ?? []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                No reminders sent yet.
              </div>
            ) : (
              (reminders ?? []).map((r, i) => {
                const membership = (Array.isArray(r.membership) ? r.membership[0] : r.membership) as { profiles?: { full_name?: string } | { full_name?: string }[] } | null
                const athleteProfile = membership ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) : null
                const stageColor =
                  r.stage === 'pre'      ? { bg: 'var(--c-ok-soft)',     fg: 'var(--c-ok-ink)' } :
                  r.stage === 'due'      ? { bg: 'var(--c-warn-soft)',   fg: 'var(--c-warn-ink)' } :
                                            { bg: 'var(--c-danger-soft)', fg: 'var(--c-danger-ink)' }
                return (
                  <div key={i} style={{
                    padding: '12px 20px',
                    borderBottom: i < (reminders ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
                    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center',
                  }}>
                    <div style={{ fontSize: 13.5, color: 'var(--c-ink)' }}>
                      {athleteProfile?.full_name ?? 'Member'}
                    </div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                      background: stageColor.bg, color: stageColor.fg, textTransform: 'uppercase',
                    }}>
                      {r.stage}
                    </span>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>
                      {new Date(r.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Memberships table */}
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
                  <Th>Athlete</Th>
                  <Th>Plan</Th>
                  <Th align="right">Price (AED)</Th>
                  <Th>Start</Th>
                  <Th>Last paid</Th>
                  <Th>Status</Th>
                  <th style={{ padding: '10px 16px' }} />
                </tr>
              </thead>
              <tbody>
                {memberships?.map((m) => {
                  const athleteProfile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
                  const s = STATUS_STYLES[m.payment_status] ?? STATUS_STYLES.unpaid
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>
                        {athleteProfile?.full_name ?? '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--c-ink-2)' }}>{m.plan_name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span className="mono" style={{ color: 'var(--c-ink-2)' }}>
                          {m.monthly_price_aed ? `${m.monthly_price_aed}` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{m.start_date}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{m.last_paid_date ?? '—'}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 999,
                          fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
                          background: s.bg, color: s.color,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {m.payment_status}
                        </span>
                        {isFrozenOn(m, todayIso) && (
                          <span className="mono" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--c-warn-ink)' }}>❄️ Frozen</span>
                        )}
                        {m.end_date && m.end_date >= todayIso && (
                          <span className="mono" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--c-danger)' }}>Cancels {m.end_date}</span>
                        )}
                        {(m.failed_charge_attempts ?? 0) > 0 && (
                          <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--c-warn-ink)' }}>
                            {m.failed_charge_attempts} card {m.failed_charge_attempts === 1 ? 'failure' : 'failures'}
                            {' · '}
                            <a href={`/portal/${signPortalToken(m.id, process.env.PORTAL_SIGN_SECRET ?? '')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--c-ink)', textDecoration: 'underline' }}>
                              copy update link
                            </a>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <PaymentActions
                          membershipId={m.id}
                          currentStatus={m.payment_status}
                          hasStripePlan={!!m.provider_plan_ref}
                          stripeConnected={stripeConnected}
                        />
                      </td>
                    </tr>
                  )
                })}
                {(!memberships || memberships.length === 0) && (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                      No memberships yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, variant }: { label: string; value: number; variant: 'ok' | 'warn' | 'danger' }) {
  const styles = {
    ok:     { bg: 'var(--c-ok-soft)',     color: 'var(--c-ok-ink)' },
    warn:   { bg: 'var(--c-warn-soft)',   color: 'var(--c-warn-ink)' },
    danger: { bg: 'var(--c-danger-soft)', color: 'var(--c-danger-ink)' },
  }[variant]
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: styles.bg }}>
      <div className="mono" style={{ fontSize: 10.5, color: styles.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, color: styles.color, marginTop: 4, letterSpacing: '-0.02em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function RevenueKpi({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  const color = accent ? 'var(--circle-lime)' : warn ? 'var(--c-danger-soft)' : '#fafafa'
  return (
    <div>
      <div className="mono" style={{ fontSize: 10.5, color: 'rgba(250,250,250,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em' }}>
        {Math.round(value).toLocaleString('en-US')}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(250,250,250,0.4)', marginTop: 2 }}>AED / mo</div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: align ?? 'left',
      fontFamily: 'var(--font-geist-mono)', fontSize: 10.5,
      fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}
