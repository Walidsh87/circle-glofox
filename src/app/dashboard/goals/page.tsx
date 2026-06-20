import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { loadGoalsData } from './_lib/load-goals'
import { GoalsCard } from '../members/[memberId]/_components/goals-card'
import { TrainingPlanCard } from '../members/[memberId]/_components/training-plan-card'

export default async function MyGoalsPage() {
  const { supabase, user, profile, boxName } = await requirePage()
  const { goals, plans } = await loadGoalsData(supabase, user.id, profile.box_id)

  return (
    <DashboardShell active="goals" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="My goals">
      <div className="flex max-w-[600px] flex-col gap-5">
        <section>
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Goals</div>
          <div className="rounded-[14px] border border-line bg-surface px-4 py-4 shadow-card">
            <GoalsCard athleteId={user.id} goals={goals} canManage />
          </div>
        </section>

        <section>
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Training plan from your coach</div>
          <div className="rounded-[14px] border border-line bg-surface px-4 py-4 shadow-card">
            <TrainingPlanCard athleteId={user.id} plans={plans} canManage={false} />
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
