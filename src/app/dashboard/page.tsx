import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}

function todayInTimezone(timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offset * 3600000).toISOString().slice(0, 10)
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const isOwner = profile.role === 'owner'
  const isStaff = ['owner', 'coach'].includes(profile.role)

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const today = todayInTimezone(timezone)

  const [
    { count: memberCount },
    { data: memberships },
    { data: todayClasses },
    { data: wod },
    { count: activeLeadCount },
    { count: tasksDueCount },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('box_id', profile.box_id)
      .eq('role', 'athlete'),
    isOwner
      ? supabase.from('memberships').select('payment_status, monthly_price_aed').eq('box_id', profile.box_id)
      : { data: null },
    isStaff
      ? supabase
          .from('class_instances')
          .select('id, starts_at, duration_minutes, capacity, class_templates(name), bookings(athlete_id)')
          .eq('box_id', profile.box_id)
          .gte('starts_at', `${today}T00:00:00Z`)
          .lt('starts_at', `${today}T23:59:59Z`)
          .order('starts_at')
          .limit(5)
      : { data: null },
    supabase
      .from('workouts')
      .select('id, title, description, scoring_type')
      .eq('box_id', profile.box_id)
      .eq('date', today)
      .single(),
    isOwner
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('box_id', profile.box_id)
          .in('status', ['new', 'contacted', 'scheduled'])
      : { count: null },
    isOwner
      ? supabase
          .from('follow_up_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('box_id', profile.box_id)
          .eq('done', false)
          .lte('due_date', today)
      : { count: null },
  ])

  const unpaidCount = memberships?.filter((m) => m.payment_status !== 'paid').length ?? 0
  const mrrAed = memberships?.filter((m) => m.payment_status === 'paid').reduce((s, m) => s + (m.monthly_price_aed ?? 0), 0) ?? 0

  const firstName = profile.full_name.split(' ')[0]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-hanken, var(--font-geist-sans))' }}>
      <Sidebar active="dashboard" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <h1 style={{
              fontFamily: 'var(--font-space-grotesk)', fontSize: 20,
              fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em',
            }}>Dashboard</h1>
          </div>
          {isStaff && (
            <Link href="/dashboard/whiteboard" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 34, padding: '0 14px', borderRadius: 8,
              border: '1px solid var(--c-border)', background: 'var(--c-surface)',
              fontSize: 13, fontWeight: 500, color: 'var(--c-ink-2)',
              textDecoration: 'none',
            }}>Open Whiteboard</Link>
          )}
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Greeting */}
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {boxName}
            </div>
            <h2 style={{
              fontFamily: 'var(--font-space-grotesk)', fontSize: 30,
              fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--c-ink)',
              marginBottom: 4,
            }}>
              Welcome, {firstName}.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>
              {profile.role === 'owner' ? 'You have full access to your gym.' : `Signed in as ${profile.role}.`}
            </p>
          </div>

          {/* Stats row — owner only */}
          {isOwner && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, maxWidth: 860 }}>
              <StatCard label="Athletes" value={String(memberCount ?? 0)} href="/dashboard/members?tab=members" />
              <StatCard label="MRR · AED" value={mrrAed > 0 ? mrrAed.toLocaleString() : '—'} href="/dashboard/payments" />
              <StatCard label="Unpaid" value={String(unpaidCount)} variant={unpaidCount > 0 ? 'warn' : undefined} href="/dashboard/payments" />
              <StatCard label="Active Leads" value={String(activeLeadCount ?? 0)} href="/dashboard/members?tab=leads" variant={activeLeadCount && activeLeadCount > 0 ? 'lime' : undefined} />
              <StatCard label="Follow-ups due" value={String(tasksDueCount ?? 0)} href="/dashboard/tasks" variant={tasksDueCount && tasksDueCount > 0 ? 'lime' : undefined} />
            </div>
          )}

          {/* Two-col: today's classes (left) + WOD hero (right) */}
          {isStaff && (
            <div style={{ display: 'grid', gridTemplateColumns: todayClasses && todayClasses.length > 0 ? '1.4fr 1fr' : '1fr', gap: 14, maxWidth: 900 }}>
              {/* Today's classes */}
              {todayClasses && todayClasses.length > 0 && (
                <div style={{
                  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                  borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
                }}>
                  <div style={{
                    padding: '14px 18px', borderBottom: '1px solid var(--c-divider)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>Today&apos;s classes</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                        {todayClasses.length} session{todayClasses.length !== 1 ? 's' : ''} scheduled
                      </div>
                    </div>
                    <Link href="/dashboard/classes" style={{ fontSize: 12, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>View all →</Link>
                  </div>
                  {todayClasses.map((cls, i) => {
                    const bookingCount = Array.isArray(cls.bookings) ? cls.bookings.length : 0
                    const cap = cls.capacity ?? 20
                    const pct = Math.round((bookingCount / cap) * 100)
                    const full = bookingCount >= cap
                    const time = new Date(cls.starts_at).toLocaleTimeString('en-GB', {
                      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
                    })
                    const templateName = Array.isArray(cls.class_templates)
                      ? cls.class_templates[0]?.name
                      : (cls.class_templates as { name: string } | null)?.name
                    return (
                      <div key={cls.id} style={{
                        display: 'grid', gridTemplateColumns: '52px 1fr auto',
                        alignItems: 'center', gap: 14, padding: '12px 18px',
                        borderBottom: i < todayClasses.length - 1 ? '1px solid var(--c-divider)' : 'none',
                      }}>
                        <div className="mono" style={{ fontSize: 16, color: 'var(--c-ink)', letterSpacing: '-0.01em' }}>{time}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--c-ink)' }}>{templateName ?? 'Class'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-2)' }}>
                              {bookingCount}<span style={{ color: 'var(--c-ink-faint)' }}>/{cap}</span>
                            </div>
                            <div style={{ width: 52, height: 5, background: 'var(--c-surface-sunk)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: full ? 'var(--c-danger)' : 'var(--circle-lime)', borderRadius: 3 }} />
                            </div>
                          </div>
                        </div>
                        {full && (
                          <span style={{
                            fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                            background: 'var(--c-danger-soft)', color: 'var(--c-danger-ink)',
                          }}>Full</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* WOD hero */}
              {wod && (
                <div style={{
                  background: 'var(--c-surface-alt)', borderRadius: 14, padding: '22px 24px',
                  border: '1px solid rgba(200, 241, 53, 0.18)',
                  position: 'relative', overflow: 'hidden', boxShadow: 'var(--c-shadow-md)',
                }}>
                  <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', border: '2px solid var(--circle-lime)', opacity: 0.4 }} />
                  <div style={{ position: 'absolute', top: 30, right: 30, width: 100, height: 100, borderRadius: '50%', background: 'var(--circle-lime)', opacity: 0.12 }} />
                  <div style={{ position: 'relative' }}>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                      Daily WOD · {today}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-space-grotesk)', fontSize: 28, fontWeight: 700,
                      color: 'var(--circle-lime)', letterSpacing: '-0.025em', marginBottom: 10,
                    }}>{wod.title}</div>
                    <pre style={{
                      fontFamily: 'var(--font-geist-mono)', fontSize: 12.5,
                      color: 'rgba(250,250,250,0.75)', lineHeight: 1.65,
                      whiteSpace: 'pre-wrap', margin: 0,
                    }}>{wod.description}</pre>
                    <Link href="/dashboard/wod" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      marginTop: 16, height: 34, padding: '0 14px', borderRadius: 8,
                      background: 'var(--circle-lime)', color: 'var(--circle-ink)',
                      fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    }}>Open leaderboard →</Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nav cards grid — always shown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, maxWidth: 900 }}>
            {isStaff && <NavCard href="/dashboard/classes" label="Class Schedule" description="Templates & generator" />}
            <NavCard href="/dashboard/schedule" label="Book a Class" description="Upcoming classes" />
            {isStaff && <NavCard href="/dashboard/whiteboard" label="Whiteboard" description="Live check-in board" accent />}
            {isStaff && <NavCard href="/dashboard/wod" label="Daily WOD" description="Workout + leaderboard" />}
            <NavCard href="/dashboard/lifts" label="My 1RMs" description="Log & calculate lifts" />
            {isOwner && <NavCard href="/dashboard/members" label="Members" description="Directory & management" />}
            {isOwner && <NavCard href="/dashboard/payments" label="Payments" description="Membership billing" />}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, variant, href }: { label: string; value: string; variant?: 'warn' | 'lime'; href?: string }) {
  const bg = variant === 'warn' ? 'var(--c-warn-soft)' : variant === 'lime' ? 'var(--circle-lime-soft)' : 'var(--c-surface)'
  const color = variant === 'warn' ? 'var(--c-warn-ink)' : variant === 'lime' ? 'var(--circle-lime-ink)' : 'var(--c-ink)'
  const labelColor = variant === 'warn' ? 'var(--c-warn-ink)' : variant === 'lime' ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)'
  const border = variant ? 'transparent' : 'var(--c-border)'
  const inner = (
    <>
      <div className="mono" style={{ fontSize: 10.5, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, color, marginTop: 4, letterSpacing: '-0.02em', fontWeight: 700 }}>{value}</div>
    </>
  )
  const style: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 12,
    background: bg, border: `1px solid ${border}`,
    boxShadow: 'var(--c-shadow-sm)', display: 'block', textDecoration: 'none',
  }
  if (href) return <a href={href} style={style}>{inner}</a>
  return <div style={style}>{inner}</div>
}

function NavCard({ href, label, description, accent }: {
  href: string; label: string; description: string; accent?: boolean
}) {
  return (
    <a href={href} style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '18px 16px',
      background: accent ? 'var(--c-surface-alt)' : 'var(--c-surface)',
      border: `1px solid ${accent ? 'rgba(200, 241, 53, 0.25)' : 'var(--c-border)'}`,
      borderRadius: 12, textDecoration: 'none',
      boxShadow: 'var(--c-shadow-sm)',
    }}>
      <div style={{
        fontFamily: 'var(--font-space-grotesk)', fontSize: 14,
        fontWeight: 600, color: accent ? 'var(--circle-lime)' : 'var(--c-ink)',
        letterSpacing: '-0.01em',
      }}>{label}</div>
      <div style={{ fontSize: 12, color: accent ? 'rgba(250,250,250,0.55)' : 'var(--c-ink-muted)', lineHeight: 1.4 }}>
        {description}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: accent ? 'var(--circle-lime)' : 'var(--c-ink-muted)', fontWeight: 500 }}>
        Open →
      </div>
    </a>
  )
}
