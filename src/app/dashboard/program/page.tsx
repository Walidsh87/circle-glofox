import Link from 'next/link'
import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { todayInTimezone } from '@/lib/timezone'
import { listActivePrograms, loadMemberProgram } from './_lib/load-program'
import { RequestProgramButton } from './_components/request-program-button'
import { ExerciseLogger } from './_components/exercise-logger'
import { buildDrip, upNext, sessionLogged } from '@/lib/program-store'
import { resolveVideoUrl } from '@/lib/program'

const fmtDay = (ymd: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(ymd + 'T12:00:00Z'))

export default async function MyProgramPage({ searchParams }: { searchParams: Promise<{ program?: string; week?: string; day?: string }> }) {
  const sp = await searchParams
  const { supabase, user, profile, boxName, box } = await requirePage()
  const programs = await listActivePrograms(supabase, user.id, profile.box_id)
  const selectedId = programs.find((p) => p.id === sp.program)?.id ?? programs[0]?.id
  const program = selectedId ? await loadMemberProgram(supabase, user.id, profile.box_id, selectedId) : null
  const today = todayInTimezone(box?.timezone ?? 'Asia/Dubai')

  const { data: vids } = await supabase.from('movement_videos').select('slug, video_url').eq('box_id', profile.box_id)
  const videoBySlug = new Map(((vids ?? []) as { slug: string; video_url: string }[]).map((v) => [v.slug, v.video_url]))

  // TrainHeroic-style navigation: week tabs → day strip → the selected day's session.
  // Selection lives in the URL (?week=&day= are 0-based indexes into the drip result);
  // no params → the current week's first unlogged day (upNext), else the first week/day.
  const weeks = program ? buildDrip(program.startDate, program.sessions, today) : []
  const next = upNext(weeks)
  const parseIdx = (raw: string | undefined, max: number): number | null => {
    if (raw == null || !/^\d+$/.test(raw)) return null
    const n = Number(raw)
    return n < max ? n : null
  }
  const weekIdx = parseIdx(sp.week, weeks.length) ?? next?.weekIdx ?? 0
  const wk = weeks[weekIdx]
  const dayIdx = (parseIdx(sp.day, wk?.sessions.length ?? 0) ?? (weekIdx === next?.weekIdx ? next.sessionIdx : 0))
  const day = wk?.sessions[dayIdx]
  const href = (w: number, d: number) => `/dashboard/program?${selectedId ? `program=${selectedId}&` : ''}week=${w}&day=${d}`

  return (
    <DashboardShell active="program" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="My program">
      <div className="flex max-w-2xl flex-col gap-4">
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

            {/* Week tabs */}
            <div className="flex flex-wrap gap-2">
              {weeks.map((w, wi) => {
                const active = wi === weekIdx
                const done = w.week != null && !w.locked && w.sessions.every((s) => sessionLogged(s, w.unlockDate, w.endDate))
                return (
                  <Link
                    key={wi}
                    href={href(wi, 0)}
                    className={`rounded-lg border px-3 py-1.5 text-center transition-colors ${
                      active ? 'border-accent bg-surface font-semibold text-ink' : 'border-line text-ink-3 hover:border-line-strong'
                    }`}
                  >
                    <span className="text-[12.5px]">
                      {w.week != null ? `Week ${w.week}` : 'Program'}
                      {w.locked ? ' 🔒' : done ? ' ✓' : ''}
                    </span>
                    {w.unlockDate && w.endDate && (
                      <span className={`block font-mono text-[10px] ${w.current ? 'text-accent-ink' : 'text-ink-3'}`}>
                        {fmtDay(w.unlockDate)} – {fmtDay(w.endDate)}{w.current ? ' · this week' : ''}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            {!wk ? null : wk.locked ? (
              <div className="rounded-[14px] border border-line bg-surface px-4 py-5 text-center text-[12.5px] text-ink-3 shadow-card">
                Unlocks {wk.unlockDate}
              </div>
            ) : (
              <>
                {/* Day strip */}
                {wk.sessions.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {wk.sessions.map((s, di) => {
                      const active = di === dayIdx
                      const logged = sessionLogged(s, wk.unlockDate, wk.endDate)
                      return (
                        <Link
                          key={di}
                          href={href(weekIdx, di)}
                          className={`min-w-[64px] rounded-lg border px-3 py-1.5 text-center transition-colors ${
                            active ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line text-ink-3 hover:border-line-strong'
                          }`}
                        >
                          <span className="block text-[12px] font-semibold">Day {di + 1}{logged ? ' ✓' : ''}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}

                {/* Selected day's session */}
                {day && (
                  <section>
                    <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
                      Day {dayIdx + 1} — {day.title}
                    </div>
                    <div className="rounded-[14px] border border-line bg-surface px-4 py-2 shadow-card">
                      {day.exercises.length === 0 ? (
                        <p className="py-2 text-[12.5px] text-ink-3">No exercises.</p>
                      ) : (
                        day.exercises.map((ex) => (
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
                )}
              </>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  )
}
