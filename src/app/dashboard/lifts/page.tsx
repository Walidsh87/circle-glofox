import { requirePage } from '@/lib/auth/page-guards'
import { Fragment } from 'react'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { LiftForm } from './_components/lift-form'
import { LIFT_NAMES } from './_lib/lift-names'
import { Calculator } from './_components/calculator'
import { LiftChart } from './_components/lift-chart'

export default async function LiftsPage() {
  const { supabase, user, profile, boxName } = await requirePage()

  const { data: lifts } = await supabase
    .from('athlete_lifts')
    .select('lift_name, one_rm_grams, recorded_on')
    .eq('athlete_id', user.id)
    .order('lift_name')

  const { data: liftHistory } = await supabase
    .from('athlete_lifts_history')
    .select('lift_name, one_rm_grams, recorded_on, is_pr')
    .eq('athlete_id', user.id)
    .order('created_at')

  const historyByLift = (liftHistory ?? []).reduce<Record<string, { recorded_on: string; one_rm_grams: number; is_pr: boolean }[]>>(
    (acc, row) => {
      if (!acc[row.lift_name]) acc[row.lift_name] = []
      acc[row.lift_name].push({ recorded_on: row.recorded_on, one_rm_grams: row.one_rm_grams, is_pr: row.is_pr })
      return acc
    },
    {}
  )

  return (
    <DashboardShell
      active="lifts"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="My 1RMs"
    >
      <div className="flex max-w-[720px] flex-col gap-5">
        {/* Log form */}
        <div className="rounded-[14px] border border-line bg-surface px-[22px] py-5 shadow-card">
          <p className="mb-3.5 text-[13px] font-semibold text-ink">Log or update a 1RM</p>
          <LiftForm lifts={lifts ?? []} />
        </div>

        {/* Current 1RMs table */}
        {lifts && lifts.length > 0 && (
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  <Th>Lift</Th>
                  <Th align="right">1RM (kg)</Th>
                  <Th align="right">Recorded</Th>
                </tr>
              </thead>
              <tbody>
                {lifts.map((lift) => (
                  <Fragment key={lift.lift_name}>
                    <tr className={cn(historyByLift[lift.lift_name]?.length >= 2 ? 'border-b-0' : 'border-b border-line')}>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {LIFT_NAMES.find((l) => l.value === lift.lift_name)?.label ?? lift.lift_name}
                        {historyByLift[lift.lift_name]?.at(-1)?.is_pr && (
                          <span title="Current 1RM is a personal record" className="ml-1.5">🏆</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-base font-semibold text-accent-ink">
                          {lift.one_rm_grams / 1000}
                        </span>
                        <span className="ml-1 font-mono text-xs text-ink-3">kg</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-xs text-ink-3">{lift.recorded_on}</span>
                      </td>
                    </tr>
                    {historyByLift[lift.lift_name]?.length >= 2 && (
                      <tr className="border-b border-line">
                        <td colSpan={3} className="p-0">
                          <LiftChart entries={historyByLift[lift.lift_name]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* THE WEDGE */}
        <Calculator lifts={lifts ?? []} />
      </div>
    </DashboardShell>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={cn(
      'px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-3',
      align === 'right' ? 'text-right' : 'text-left'
    )}>{children}</th>
  )
}
