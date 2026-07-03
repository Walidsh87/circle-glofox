import Link from 'next/link'
import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { todayInTimezone } from '@/lib/timezone'
import { listActivePrograms, loadMemberProgram } from './_lib/load-program'
import { RequestProgramButton } from './_components/request-program-button'
import { ExerciseLogger } from './_components/exercise-logger'
import { buildDrip, upNext } from '@/lib/program-store'
import { resolveVideoUrl } from '@/lib/program'

const fmtDay = (ymd: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(ymd + 'T12:00:00Z'))

export default async function MyProgramPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const sp = await searchParams
  const { supabase, user, profile, boxName, box } = await requirePage()
  const programs = await listActivePrograms(supabase, user.id, profile.box_id)
  const selectedId = programs.find((p) => p.id === sp.program)?.id ?? programs[0]?.id
  const program = selectedId ? await loadMemberProgram(supabase, user.id, profile.box_id, selectedId) : null
  const today = todayInTimezone(box?.timezone ?? 'Asia/Dubai')

  const { data: vids } = await supabase.from('movement_videos').select('slug, video_url').eq('box_id', profile.box_id)
  const videoBySlug = new Map(((vids ?? []) as { slug: string; video_url: string }[]).map((v) => [v.slug, v.video_url]))

  const weeks = program ? buildDrip(program.startDate, program.sessions, today) : []
  const next = upNext(weeks)

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
            {programs.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {programs.map((p) => (
                  <Link
                    key={p.id}
                    href={`/dashboard/program?program=${p.id}`}
                    className={`rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                      p.id === selectedId ? 'border-accent font-semibold text-ink' : 'border-line text-ink-3 hover:border-line-strong'
                    }`}
                  >
                    {p.title}
                    {p.source === 'bought' ? ' · bought' : ''}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">{program.title}</h2>
                {program.notes && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-2">{program.notes}</p>}
              </div>
              <RequestProgramButton />
            </div>

            {next && (
              <div className="rounded-[14px] border border-accent bg-surface px-4 py-3 shadow-card">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Up next</div>
                <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{weeks[next.weekIdx].sessions[next.sessionIdx].title}</div>
                <div className="text-[11.5px] text-ink-3">
                  Week {weeks[next.weekIdx].week} · {fmtDay(weeks[next.weekIdx].unlockDate!)} – {fmtDay(weeks[next.weekIdx].endDate!)}
                </div>
              </div>
            )}

            {weeks.map((wk, wi) => (
              <div key={wi} className="flex flex-col gap-3">
                {wk.week != null && (
                  <div className={`font-mono text-[10.5px] uppercase tracking-[0.08em] ${wk.current ? 'font-semibold text-accent-ink' : 'text-ink-3'}`}>
                    Week {wk.week}
                    {wk.unlockDate && wk.endDate ? ` · ${fmtDay(wk.unlockDate)} – ${fmtDay(wk.endDate)}` : ''}
                    {wk.current ? ' · this week' : ''}
                  </div>
                )}
                {wk.locked ? (
                  <div className="rounded-[14px] border border-line bg-surface px-4 py-5 text-center text-[12.5px] text-ink-3 shadow-card">
                    Unlocks {wk.unlockDate}
                  </div>
                ) : (
                  wk.sessions.map((s, i) => (
                    <section key={i}>
                      <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{s.title}</div>
                      <div className={`rounded-[14px] border bg-surface px-4 py-2 shadow-card ${next && wi === next.weekIdx && i === next.sessionIdx ? 'border-accent' : 'border-line'}`}>
                        {s.exercises.length === 0 ? (
                          <p className="py-2 text-[12.5px] text-ink-3">No exercises.</p>
                        ) : (
                          s.exercises.map((ex) => (
                            <ExerciseLogger
                              key={ex.id}
                              exercise={ex}
                              today={today}
                              videoUrl={resolveVideoUrl(ex.video_url, ex.lift_name, videoBySlug)}
                            />
                          ))
                        )}
                      </div>
                    </section>
                  ))
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </DashboardShell>
  )
}
