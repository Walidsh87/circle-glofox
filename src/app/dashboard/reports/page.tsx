import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { requireManagerPage } from '@/lib/auth/page-guards'

const REPORTS = [
  { href: '/dashboard/reports/attendance', title: 'Attendance & no-shows', desc: 'Check-in trends, busiest classes, no-show rates over time.' },
  { href: '/dashboard/reports/lead-funnel', title: 'Lead funnel', desc: 'Lead → member conversion, split by acquisition source.' },
  { href: '/dashboard/reports/classes', title: 'Class & coach performance', desc: 'Fill rate and no-show rate per class template and per coach.' },
  { href: '/dashboard/reports/churn', title: 'Churn trend', desc: 'Monthly joins, churns, and churn rate over the last 12 months.' },
  { href: '/dashboard/reports/payroll', title: 'Payroll', desc: 'Per-coach pay: class rates, monthly salaries, and PT sessions.', ownerOnly: true },
]

export default async function ReportsHubPage() {
  const { profile, boxName } = await requireManagerPage()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Reports</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {REPORTS.filter((r) => !('ownerOnly' in r) || profile.role === 'owner').map((r) => (
              <Link key={r.href} href={r.href} style={{ display: 'block', padding: '16px 18px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none' }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-ink)' }}>{r.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 3 }}>{r.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
