import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireManagerPage } from '@/lib/auth/page-guards'

const REPORTS = [
  { href: '/dashboard/reports/attendance', title: 'Attendance & no-shows', desc: 'Check-in trends, busiest classes, no-show rates over time.' },
  { href: '/dashboard/reports/lead-funnel', title: 'Lead funnel', desc: 'Lead → member conversion, split by acquisition source.' },
  { href: '/dashboard/reports/classes', title: 'Class & coach performance', desc: 'Fill rate and no-show rate per class template and per coach.' },
  { href: '/dashboard/reports/churn', title: 'Churn trend', desc: 'Monthly joins, churns, and churn rate over the last 12 months.' },
  { href: '/dashboard/reports/payroll', title: 'Payroll', desc: 'Per-coach pay: class rates, monthly salaries, and PT sessions.', ownerOnly: true },
  { href: '/dashboard/reports/accounting', title: 'Accounting export', desc: 'Issued invoices with VAT split — importable into Zoho Books, Xero, or QuickBooks.' },
]

export default async function ReportsHubPage() {
  const { profile, boxName } = await requireManagerPage()

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Reports"
    >
      <div className="flex max-w-2xl flex-col gap-2.5">
        {REPORTS.filter((r) => !('ownerOnly' in r) || profile.role === 'owner').map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="text-sm font-semibold text-ink">{r.title}</div>
            <div className="mt-0.5 text-xs text-ink-3">{r.desc}</div>
          </Link>
        ))}
      </div>
    </DashboardShell>
  )
}
