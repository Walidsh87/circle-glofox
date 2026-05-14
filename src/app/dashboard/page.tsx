import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'

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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
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
            <a href="/dashboard/whiteboard" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 34, padding: '0 14px', borderRadius: 8,
              border: '1px solid var(--c-border)', background: 'var(--c-surface)',
              fontSize: 13, fontWeight: 500, color: 'var(--c-ink-2)',
              textDecoration: 'none', transition: 'background .1s',
            }}>Open Whiteboard</a>
          )}
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
          {/* Greeting */}
          <div style={{ marginBottom: 28 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              {boxName}
            </div>
            <h2 style={{
              fontFamily: 'var(--font-space-grotesk)', fontSize: 30,
              fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--c-ink)',
              marginBottom: 4,
            }}>
              Welcome, {profile.full_name.split(' ')[0]}.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>
              {profile.role === 'owner' ? 'You have full access to your gym.' : `Signed in as ${profile.role}.`}
            </p>
          </div>

          {/* Nav cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 900 }}>
            {isStaff && (
              <NavCard href="/dashboard/classes" label="Class Schedule" description="Templates & instance generator" />
            )}
            <NavCard href="/dashboard/schedule" label="Book a Class" description="View and book upcoming classes" />
            {isStaff && (
              <NavCard href="/dashboard/whiteboard" label="Whiteboard" description="Live check-in board" accent />
            )}
            {isStaff && (
              <NavCard href="/dashboard/wod" label="Daily WOD" description="Today's workout + leaderboard" />
            )}
            <NavCard href="/dashboard/lifts" label="My 1RMs" description="Log lifts and run the calculator" />
            {isOwner && (
              <NavCard href="/dashboard/members" label="Members" description="Directory and member management" />
            )}
            {isOwner && (
              <NavCard href="/dashboard/payments" label="Payments" description="Membership billing tracker" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NavCard({ href, label, description, accent }: {
  href: string; label: string; description: string; accent?: boolean
}) {
  return (
    <a href={href} style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '20px 18px',
      background: accent ? 'var(--circle-ink)' : 'var(--c-surface)',
      border: `1px solid ${accent ? '#222' : 'var(--c-border)'}`,
      borderRadius: 14, textDecoration: 'none',
      boxShadow: 'var(--c-shadow-sm)',
      transition: 'box-shadow .1s, transform .1s',
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--c-shadow-md)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--c-shadow-sm)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        fontFamily: 'var(--font-space-grotesk)', fontSize: 15,
        fontWeight: 600, color: accent ? 'var(--circle-lime)' : 'var(--c-ink)',
        letterSpacing: '-0.01em',
      }}>{label}</div>
      <div style={{ fontSize: 12.5, color: accent ? 'rgba(250,250,250,0.6)' : 'var(--c-ink-muted)', lineHeight: 1.4 }}>
        {description}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: accent ? 'var(--circle-lime)' : 'var(--c-ink-muted)', fontWeight: 500 }}>
        Open →
      </div>
    </a>
  )
}
