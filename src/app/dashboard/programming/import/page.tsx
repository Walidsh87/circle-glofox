import { requireProgrammingPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { ImportForm } from '../_components/import-form'

export default async function ImportPage() {
  const { profile, boxName } = await requireProgrammingPage()

  return (
    <DashboardShell
      active="programming"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title={
        <span className="flex items-center gap-3">
          <Link
            href="/dashboard/programming"
            className="font-sans text-[13px] font-normal tracking-normal text-ink-3 transition-colors hover:text-ink"
          >
            ← Calendar
          </Link>
          <span className="text-base font-normal text-line-strong">/</span>
          <span>Import WODs</span>
        </span>
      }
    >
      <ImportForm />
    </DashboardShell>
  )
}
