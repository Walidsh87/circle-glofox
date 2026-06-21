import { requireProgrammingPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { ImportProgram } from '../_components/import-program'
import Link from 'next/link'

export default async function ImportTemplatePage() {
  const { profile, boxName } = await requireProgrammingPage()

  return (
    <DashboardShell
      active="program-store"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title={
        <span className="flex items-center gap-3">
          <Link
            href="/dashboard/program-store"
            className="font-sans text-[13px] font-normal tracking-normal text-ink-3 transition-colors hover:text-ink"
          >
            ← Program Store
          </Link>
          <span className="text-base font-normal text-line-strong">/</span>
          <span>Import from text</span>
        </span>
      }
    >
      <div className="p-5 md:p-8">
        <ImportProgram />
      </div>
    </DashboardShell>
  )
}
