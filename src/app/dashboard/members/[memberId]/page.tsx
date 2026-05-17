import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { EditMemberForm } from './_components/edit-member-form'

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

export default async function MemberProfilePage({ params }: { params: { memberId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: viewer } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!viewer) redirect('/onboarding')
  if (!['owner', 'coach'].includes(viewer.role)) redirect('/dashboard')

  const boxes = viewer.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [
    { data: member },
    { data: memberships },
    { data: lifts },
    { data: scores },
    { data: bookings },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, created_at')
      .eq('id', params.memberId)
      .eq('box_id', viewer.box_id)
      .single(),
    supabase
      .from('memberships')
      .select('id, plan_name, monthly_price_aed, payment_status, start_date, last_paid_date, end_date')
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
      .order('logged_at', { ascending: false })
      .limit(8),
    supabase
      .from('bookings')
      .select('id, checked_in, booked_at, class_instances(starts_at, class_templates(name))')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('booked_at', { ascending: false })
      .limit(10),
  ])

  if (!member) notFound()

  const activeMembership = memberships?.find((m) => !m.end_date) ?? null
  const rs = activeMembership ? (STATUS_STYLES[activeMembership.payment_status] ?? STATUS_STYLES.unpaid) : null
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
          <EditMemberForm
            memberId={member.id}
            fullName={member.full_name}
            phone={member.phone}
            role={member.role}
            viewerRole={viewer.role}
          />
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
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>Recent WOD Scores</span>
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

          </div>
        </div>
      </div>
    </div>
  )
}
