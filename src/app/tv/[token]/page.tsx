import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { CircleMark } from '@/components/circle-mark'
import { cn } from '@/lib/utils'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { sortLeaderboard } from '../_lib/leaderboard'
import { AutoRefresh } from '../_components/auto-refresh'
import { todayInTimezone } from '@/lib/timezone'
import { formatHijri, inRamadanWindow } from '@/lib/hijri'

export const dynamic = 'force-dynamic'

const SCORING_LABEL: Record<string, string> = { time: 'For Time', rounds_reps: 'Rounds + Reps', load_kg: 'Max Load', amrap: 'AMRAP' }

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}
function liftLabel(v: string): string {
  return LIFT_NAMES.find((l) => l.value === v)?.label ?? v
}

type ScoreRow = { athlete_id: string; score_value: number; rx: boolean; is_pr: boolean; profiles: { full_name: string } | { full_name: string }[] | null }
type LiftRow = { lift_name: string; profiles: { full_name: string } | { full_name: string }[] | null }

export default async function TvBoardPage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // No session on a wall TV → service-role. EVERY read below MUST be box-scoped.
  const service = createServiceClient()

  const { data: box } = await service
    .from('boxes')
    .select('id, name, timezone, ramadan_start, ramadan_end')
    .eq('tv_token', token)
    .maybeSingle()
  if (!box) notFound()

  const timezone = box.timezone ?? 'Asia/Dubai'
  const todayIso = todayInTimezone(timezone)

  const { data: wod } = await service
    .from('workouts')
    .select('id, title, description, scoring_type, strength_lift, strength_sets, scaling')
    .eq('box_id', box.id)
    .eq('date', todayIso)
    .maybeSingle()

  const { data: scoreRows } = wod
    ? await service
        .from('workout_scores')
        .select('athlete_id, score_value, rx, is_pr, profiles(full_name)')
        .eq('box_id', box.id)
        .eq('workout_id', wod.id)
    : { data: [] as ScoreRow[] }

  const leaderboard = sortLeaderboard(
    ((scoreRows ?? []) as ScoreRow[]).map((s) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
      return { athlete_id: s.athlete_id, score_value: s.score_value, rx: s.rx, is_pr: s.is_pr, name: p?.full_name ?? 'Athlete' }
    }),
    wod?.scoring_type ?? 'time',
  )

  const { data: liftPrs } = await service
    .from('athlete_lifts_history')
    .select('lift_name, profiles(full_name)')
    .eq('box_id', box.id)
    .eq('is_pr', true)
    .eq('recorded_on', todayIso)

  const prs: { name: string; what: string }[] = [
    ...leaderboard.filter((s) => s.is_pr).map((s) => ({ name: s.name, what: wod?.title ?? 'WOD' })),
    ...((liftPrs ?? []) as LiftRow[]).map((l) => {
      const p = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles
      return { name: p?.full_name ?? 'Athlete', what: liftLabel(l.lift_name) }
    }),
  ]

  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const strengthLabel = wod?.strength_lift ? liftLabel(wod.strength_lift) : null
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date())

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-canvas">
      <AutoRefresh seconds={30} />

      <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-line px-10">
        <div className="flex items-center gap-2.5 font-display text-xl font-bold uppercase text-ink">
          <CircleMark size={26} onDark />
          <span>{box.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="c-pulse h-[9px] w-[9px] rounded-full bg-accent" />
          <span className="font-mono text-sm uppercase tracking-[0.06em] text-accent-ink">Live</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 font-mono text-base text-ink-3">
          <span>{today}</span>
          <span className="text-ink-faint">· {formatHijri(todayIso)}</span>
          {inRamadanWindow(todayIso, box.ramadan_start ?? null, box.ramadan_end ?? null) && (
            <span className="rounded bg-warn-soft px-2 py-0.5 text-sm font-bold text-warn">Ramadan timetable</span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[26px] px-10 py-9">
        {wod ? (
          <div className="rounded-[18px] border border-line-strong bg-surface px-8 py-7">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-3.5">
              <h1 className="font-display text-[44px] font-bold tracking-[-0.02em] text-ink">{wod.title}</h1>
              <span className="font-mono text-sm uppercase tracking-[0.08em] text-accent-ink">{SCORING_LABEL[wod.scoring_type] ?? wod.scoring_type}</span>
            </div>
            <div className="whitespace-pre-wrap text-[22px] leading-normal text-ink-2">{wod.description}</div>
            {strengthLabel && strengthSets.length > 0 && (
              <div className="mt-4 font-mono text-base text-accent-ink">
                Strength · {strengthLabel} · {strengthSets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
              </div>
            )}
            {((wod.scaling ?? []) as { label: string; description: string }[]).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-4">
                {((wod.scaling ?? []) as { label: string; description: string }[]).map((t, i) => (
                  <div key={i} className="flex-1 basis-[260px]">
                    <div className="font-mono text-[13px] uppercase tracking-[0.06em] text-accent-ink">{t.label}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-lg leading-snug text-ink-2">{t.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid flex-1 place-items-center font-display text-[32px] text-ink-3">No WOD posted today.</div>
        )}

        {wod && (
          <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-6">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="border-b border-line bg-canvas px-[22px] py-3.5 font-display text-lg font-semibold text-ink">Leaderboard</div>
              {leaderboard.length === 0 ? (
                <p className="px-[22px] py-5 text-base text-ink-faint">No scores logged yet.</p>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {leaderboard.map((s, i) => (
                      <tr key={s.athlete_id} className={cn(i < leaderboard.length - 1 && 'border-b border-line', i === 0 && 'bg-accent-soft')}>
                        <td className={cn('w-11 px-[22px] py-3 font-mono text-lg font-bold', i === 0 ? 'text-accent-ink' : 'text-ink-faint')}>{i + 1}</td>
                        <td className="px-2 py-3 text-[19px] font-semibold text-ink">{s.name}</td>
                        <td className="px-2 py-3">
                          {s.rx && <span className="rounded bg-ok-soft px-[7px] py-0.5 font-mono text-[11px] font-bold text-ok">RX</span>}
                          {s.is_pr && <span className="ml-1.5">🏆</span>}
                        </td>
                        <td className={cn('px-[22px] py-3 text-right font-mono font-bold', i === 0 ? 'text-2xl text-accent-ink' : 'text-xl text-ink')}>{formatScore(s.score_value, wod.scoring_type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="border-b border-line bg-canvas px-[22px] py-3.5 font-display text-lg font-semibold text-ink">🏆 PRs Today</div>
              {prs.length === 0 ? (
                <p className="px-[22px] py-5 text-[15px] text-ink-faint">No PRs yet today.</p>
              ) : (
                <div className="flex flex-col gap-3 px-[22px] py-4">
                  {prs.map((p, i) => (
                    <div key={i} className="text-[17px] text-ink">
                      <span className="font-bold">{p.name}</span>
                      <span className="text-ink-3"> — {p.what}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
