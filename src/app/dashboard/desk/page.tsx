import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { DeskSearch } from './_components/DeskSearch'

export default async function DeskPage() {
  const { profile, boxName } = await requireStaffPage()
  return (
    <DashboardShell
      active="desk"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Front Desk"
    >
      <div className="mx-auto w-full max-w-3xl">
        <p className="mb-5 text-[13px] text-ink-3">Search a member or lead, then check in, take payment, or sign up a walk-in.</p>
        <DeskSearch />
      </div>
    </DashboardShell>
  )
}
