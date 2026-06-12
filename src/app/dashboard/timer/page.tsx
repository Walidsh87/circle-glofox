import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Timer } from './_components/timer'

export default async function TimerPage() {
  const { profile, boxName } = await requirePage()

  return (
    <DashboardShell
      active="timer"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Timer"
    >
      <div className="grid min-h-full place-items-center">
        <Timer />
      </div>
    </DashboardShell>
  )
}
