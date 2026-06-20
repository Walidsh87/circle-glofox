import Link from 'next/link'
import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { loadResolvedProgram } from './_lib/load-program'
import { RequestProgramButton } from './_components/request-program-button'
import type { ResolvedExercise } from '@/lib/program'

function ExerciseRow({ ex }: { ex: ResolvedExercise }) {
  const prescription = [ex.sets ? `${ex.sets}×${ex.reps || '—'}` : ex.reps, ex.lift_name && ex.percentage ? `@ ${ex.percentage}%` : null].filter(Boolean).join(' ')
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-ink">{ex.name}</div>
        <div className="text-[12px] text-ink-3">
          {prescription}
          {ex.target_note ? ` · ${ex.target_note}` : ''}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {ex.load ? (
          <span className="font-mono text-[13px] font-semibold text-accent-ink">{ex.load.barKg} kg</span>
        ) : ex.needsOneRm ? (
          <Link href="/dashboard/lifts" className="text-[11.5px] text-ink-3 underline">set your 1RM</Link>
        ) : null}
      </div>
    </div>
  )
}

export default async function MyProgramPage() {
  const { supabase, user, profile, boxName } = await requirePage()
  const program = await loadResolvedProgram(supabase, user.id, profile.box_id)

  return (
    <DashboardShell active="program" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="My program">
      <div className="flex max-w-2xl flex-col gap-5">
        {!program ? (
          <div className="rounded-[14px] border border-line bg-surface px-4 py-8 text-center shadow-card">
            <p className="text-sm text-ink-2">No program assigned yet.</p>
            <div className="mt-3 flex justify-center"><RequestProgramButton /></div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">{program.title}</h2>
                {program.notes && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-2">{program.notes}</p>}
              </div>
              <RequestProgramButton />
            </div>

            {program.sessions.map((s, i) => (
              <section key={i}>
                <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{s.title}</div>
                <div className="rounded-[14px] border border-line bg-surface px-4 py-2 shadow-card">
                  {s.exercises.length === 0 ? (
                    <p className="py-2 text-[12.5px] text-ink-3">No exercises.</p>
                  ) : (
                    s.exercises.map((ex) => <ExerciseRow key={ex.client_uid} ex={ex} />)
                  )}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </DashboardShell>
  )
}
