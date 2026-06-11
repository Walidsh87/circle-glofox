import { requirePage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { Timer } from './_components/timer'

export default async function TimerPage() {
  const { profile, boxName } = await requirePage()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="timer" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Timer</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '40px 32px', display: 'grid', placeItems: 'center' }}>
          <Timer />
        </div>
      </div>
    </div>
  )
}
