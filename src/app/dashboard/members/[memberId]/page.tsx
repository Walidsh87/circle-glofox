import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { EditMemberForm } from './_components/edit-member-form'
import { SellPackage } from './_components/sell-package'
import { currentStreakWeeks, totalCheckins, currentMilestone, nextMilestone } from '@/lib/consistency'
import { MembershipLifecycle } from './_components/membership-lifecycle'

const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  owner:   { bg: 'var(--circle-lime-soft)', color: 'var(--circle-lime-ink)' },
  coach:   { bg: 'var(--c-ok-soft)',        color: 'var(--c-ok-ink)' },
  athlete: { bg: 'var(--c-surface-alt)',    color: 'var(--c-ink-muted)' },
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  paid:    { bg: 'var(--c-ok-soft)',     color: 'var(--c-ok-ink)' },
  unpaid:  { bg: 'var(--c-warn-soft)',   color: 'var(--c-warn-ink)' },
  overdue: { bg: 'var(--c-danger-soft)', color: 'var(--c-danger-ink)' },
}

const LIFT_LABELS: Record<string, string> = {
  back_squat: 'Back Squat', front_squat: 'Front Squat', deadlift: 'Deadlift',
  clean: 'Clean', clean_and_jerk: 'Clean & Jerk', snatch: 'Snatch',
  overhead_squat: 'OHS', shoulder_press: 'Press', push_press: 'Push Press',
  thruster: 'Thruster', bench_press: 'Bench Press',
}

function formatLiftName(name: string): string {
  return LIFT_LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso))
}

export default async function MemberProfilePage(ctx: { params: Promise<{ memberId: string }> }) {
  const params = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: viewer } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!viewer) redirect('/onboarding')
  if (!['owner', 'coach'].includes(viewer.role) && user.id !== params.memberId) redirect('/dashboard')

  const boxes = viewer.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [
    { data: member },
    { data: memberships },
    { data: lifts },
    { data: scores },
    { data: bookings },
    { data: pdplExports },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, created_at')
      .eq('id', params.memberId)
      .eq('box_id', viewer.box_id)
      .single(),
    supabase
      .from('memberships')
      .select('id, plan_name, monthly_price_aed, payment_status, start_date, last_paid_date, end_date, frozen_from, frozen_until')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('start_date', { ascending: false }),
    supabase
      .from('athlete_lifts')
      .select('lift_name, one_rm_grams')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('lift_name'),
    supabase
      .from('workout_scores')
      .select('score_value, rx, logged_at, workouts(title, scoring_type)')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('logged_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, checked_in, booked_at, class_instances(starts_at, class_templates(name))')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('booked_at', { ascending: false })
      .limit(10),
    supabase
      .from('pdpl_exports')
      .select(`
        exported_at,
        ip_address,
        exporter:profiles!pdpl_exports_exported_by_fkey(full_name)
      `)
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('exported_at', { ascending: false })
      .limit(10),
    supabase
      .from('invoices')
      .select('id, invoice_number, issued_at, total_aed, credit_notes(total_aed)')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('issued_at', { ascending: false })
      .limit(20),
  ])

  if (!member) notFound()

  const isOwner = viewer.role === 'owner'
  const [{ data: activePackages }, { data: memberCredits }] = await Promise.all([
    isOwner
      ? supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', viewer.box_id).eq('active', true).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; type: string; credit_count: number; price_aed: number }[] }),
    isOwner
      ? supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', params.memberId).eq('box_id', viewer.box_id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; kind: string; credits_remaining: number; credits_total: number; expires_at: string | null; packages: { name: string } | { name: string }[] | null }[] }),
  ])

  const today = new Date().toISOString().slice(0, 10)
  // A membership with a *future* end_date (scheduled to cancel) is still the active one.
  const activeMembership = memberships?.find((m) => !m.end_date || m.end_date >= today) ?? null
  const rs = activeMembership ? (STATUS_STYLES[activeMembership.payment_status] ?? STATUS_STYLES.unpaid) : null

  // Consistency (Committed Club): full checked-in history (the bookings list above is capped at 10).
  const { data: attendance } = await supabase
    .from('bookings')
    .select('class_instances(starts_at)')
    .eq('athlete_id', params.memberId)
    .eq('box_id', viewer.box_id)
    .eq('checked_in', true)
  const checkInDates = (attendance ?? [])
    .map((b) => {
      const ci = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
      return (ci as { starts_at: string } | null)?.starts_at?.slice(0, 10) ?? null
    })
    .filter((d): d is string => d !== null)
  const consistencyTotal = totalCheckins(checkInDates)
  const consistencyStreak = currentStreakWeeks(checkInDates, today)
  const consistencyBadge = currentMilestone(consistencyTotal)
  const consistencyNext = nextMilestone(consistencyTotal)
  const roleSt = ROLE_STYLES[member.role] ?? ROLE_STYLES.athlete

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="members" userName={viewer.full_name} userRole={viewer.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0, gap: 12,
        }}>
          <Link href="/dashboard/members" style={{
            fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            ← Members
          </Link>
          <span style={{ color: 'var(--c-border)', fontSize: 16 }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            {member.full_name}
          </h1>
          {['owner', 'coach'].includes(viewer.role) && (
            <EditMemberForm
              memberId={member.id}
              fullName={member.full_name}
              phone={member.phone}
              role={member.role}
              viewerRole={viewer.role}
            />
          )}
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 800 }}>

            {/* Profile card */}
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 14, padding: '20px 24px', marginBottom: 16,
              boxShadow: 'var(--c-shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 700, color: 'var(--c-ink)' }}>
                      {member.full_name}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                      textTransform: 'capitalize', background: roleSt.bg, color: roleSt.color,
                    }}>
                      {member.role}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                    {member.email && (
                      <span style={{ fontSize: 13.5, color: 'var(--c-ink-2)' }}>{member.email}</span>
                    )}
                    {member.phone && (
                      <span className="mono" style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>{member.phone}</span>
                    )}
                    <span style={{ fontSize: 12.5, color: 'var(--c-ink-faint)' }}>
                      Joined {formatDate(member.created_at)}
                    </span>
                  </div>
                </div>

                {activeMembership && rs && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 4 }}>
                      {activeMembership.plan_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      {activeMembership.monthly_price_aed && (
                        <span className="mono" style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>
                          AED {activeMembership.monthly_price_aed}/mo
                        </span>
                      )}
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                        textTransform: 'capitalize', background: rs.bg, color: rs.color,
                      }}>
                        {activeMembership.payment_status}
                      </span>
                    </div>
                    {activeMembership.last_paid_date && (
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-faint)', marginTop: 4 }}>
                        Last paid {activeMembership.last_paid_date}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {viewer.role === 'owner' && activeMembership && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Membership lifecycle</div>
                <MembershipLifecycle membershipId={activeMembership.id} frozenFrom={activeMembership.frozen_from ?? null} frozenUntil={activeMembership.frozen_until ?? null} endDate={activeMembership.end_date ?? null} today={today} />
              </div>
            )}

            {/* Consistency (Committed Club) */}
            <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Consistency</div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div><span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-ink)' }}>{consistencyStreak > 0 ? `🔥 ${consistencyStreak}` : '—'}</span> <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>week streak</span></div>
                <div><span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-ink)' }}>{consistencyTotal}</span> <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>check-ins{consistencyBadge !== null ? ` · 🏅 ${consistencyBadge} Club` : ''}</span></div>
              </div>
              {consistencyNext && (
                <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 8 }}>{consistencyNext.remaining} to the {consistencyNext.threshold} Club</div>
              )}
            </div>

            {/* 1RMs + Recent Scores */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

              {/* 1RM Lifts */}
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
              }}>
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--c-divider)',
                  background: 'var(--c-surface-sunk)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>1RM Lifts</span>
                </div>
                {lifts && lifts.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {lifts.map((lift) => (
                        <tr key={lift.lift_name} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                          <td style={{ padding: '10px 16px', fontSize: 13.5, color: 'var(--c-ink-2)' }}>
                            {formatLiftName(lift.lift_name)}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-ink)' }}>
                              {(lift.one_rm_grams / 1000).toFixed(1)} kg
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--c-ink-faint)', fontSize: 13 }}>
                    No lifts logged yet.
                  </div>
                )}
              </div>

              {/* Recent WOD Scores */}
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
              }}>
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--c-divider)',
                  background: 'var(--c-surface-sunk)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>WOD Score History</span>
                </div>
                {scores && scores.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {scores.map((s, i) => {
                        const wod = Array.isArray(s.workouts) ? s.workouts[0] : s.workouts
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                            <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--c-ink-2)' }}>
                              {wod?.title ?? '—'}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                {s.rx && (
                                  <span className="mono" style={{
                                    fontSize: 9.5, fontWeight: 700, padding: '1px 5px',
                                    borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)',
                                  }}>RX</span>
                                )}
                                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)' }}>
                                  {wod ? formatScore(s.score_value, wod.scoring_type) : s.score_value}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--c-ink-faint)', fontSize: 13 }}>
                    No scores logged yet.
                  </div>
                )}
              </div>
            </div>

            {/* Recent Bookings */}
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
            }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--c-divider)',
                background: 'var(--c-surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>Recent Bookings</span>
              </div>
              {bookings && bookings.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {bookings.map((b) => {
                      const inst = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
                      const tmpl = inst ? (Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates) : null
                      const startsAt = inst?.starts_at ? new Date(inst.starts_at) : null
                      return (
                        <tr key={b.id} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--c-ink-2)' }}>
                            {tmpl?.name ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
                              {startsAt ? formatDate(startsAt.toISOString()) : '—'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', width: 60, textAlign: 'right' }}>
                            {b.checked_in && (
                              <span style={{ fontSize: 11.5, color: 'var(--c-ok-ink)', fontWeight: 600 }}>✓ In</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--c-ink-faint)', fontSize: 13 }}>
                  No bookings yet.
                </div>
              )}
            </div>

            {/* Invoices */}
            {(invoices ?? []).length > 0 && (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, overflow: 'hidden', marginTop: 20,
                boxShadow: 'var(--c-shadow-sm)',
              }}>
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--c-divider)',
                  background: 'var(--c-surface-sunk)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>VAT Invoices</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {(invoices ?? []).map((inv) => {
                      const cns = (inv as { credit_notes?: { total_aed: number }[] }).credit_notes ?? []
                      const refunded = cns.reduce((s, c) => s + Number(c.total_aed), 0)
                      return (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--c-divider)' }}>
                          <td style={{ padding: '10px 16px' }}>
                            <Link href={`/dashboard/invoices/${inv.id}`} className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink)', textDecoration: 'none' }}>
                              {inv.invoice_number}
                            </Link>
                            {refunded > 0 && (
                              <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--c-warn-soft)', color: 'var(--c-warn-ink)' }}>
                                {refunded >= Number(inv.total_aed) - 0.001 ? 'Refunded' : 'Partial refund'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
                              {formatDate(inv.issued_at)}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            <span style={{ fontSize: 13, color: 'var(--c-ink)', fontWeight: 600 }}>
                              AED {Number(inv.total_aed).toFixed(2)}
                            </span>
                            {refunded > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--c-warn-ink)' }}>
                                −AED {refunded.toFixed(2)}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Packages & credits — owner only */}
            {isOwner && (
              <div style={{ marginTop: 20 }}>
                <SellPackage athleteId={params.memberId} packages={activePackages ?? []} credits={memberCredits ?? []} />
              </div>
            )}

            {/* PDPL Data Export — owner only */}
            {viewer.role === 'owner' && (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '18px 20px', marginTop: 20,
                boxShadow: 'var(--c-shadow-sm)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 3 }}>
                      PDPL Data Export
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
                      UAE Federal Decree-Law No. 45 of 2021 — data subject access request
                    </div>
                  </div>
                  <a
                    href={`/api/pdpl/export/${params.memberId}`}
                    download
                    style={{
                      padding: '8px 14px', borderRadius: 8,
                      background: 'var(--circle-lime)', color: 'var(--circle-ink)',
                      fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Export JSON ↓
                  </a>
                </div>

                <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 12, marginTop: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Export history
                  </div>
                  {(pdplExports ?? []).length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--c-ink-faint)' }}>No exports yet.</div>
                  ) : (
                    (pdplExports ?? []).map((e, i) => {
                      const exporter = (Array.isArray(e.exporter) ? e.exporter[0] : e.exporter) as { full_name?: string } | null
                      return (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
                          padding: '6px 0', fontSize: 12, color: 'var(--c-ink-2)',
                          borderBottom: i < (pdplExports ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
                        }}>
                          <div>
                            <span style={{ color: 'var(--c-ink)' }}>{exporter?.full_name ?? 'Owner'}</span>
                            {e.ip_address && (
                              <span className="mono" style={{ color: 'var(--c-ink-faint)', marginLeft: 8, fontSize: 11 }}>
                                {e.ip_address}
                              </span>
                            )}
                          </div>
                          <div className="mono" style={{ color: 'var(--c-ink-faint)', fontSize: 11 }}>
                            {new Date(e.exported_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
