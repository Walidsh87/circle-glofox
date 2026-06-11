import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { ImportForm } from '../_components/import-form'

export default async function ImportPage() {
  const { profile, boxName } = await requireStaffPage()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <Link href="/dashboard/programming" style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>← Calendar</Link>
          <span style={{ color: 'var(--c-border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Import WODs</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <ImportForm />
        </div>
      </div>
    </div>
  )
}
