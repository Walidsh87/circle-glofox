import { requirePage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { WodForm } from './_components/wod-form'
import { ScoreSection } from './_components/score-section'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { loadForPercent } from '@/lib/percentage'
import type { StrengthSet } from './_lib/validation'
import { todayInTimezone } from '@/lib/timezone'

const SCORING_LABELS: Record<string, string> = {
  time:        'For Time',
  rounds_reps: 'AMRAP (rounds + reps)',
  load_kg:     'Max Load (kg)',
  amrap:       'AMRAP (total reps)',
}

function prevDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(date + 'T00:00:00Z'))
}

// Monday of the week containing `date`
function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  const dow = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

// Sunday of the week containing `date`
function weekEnd(date: string): string {
  const start = new Date(weekStart(date) + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() + 6)
  return start.toISOString().slice(0, 10)
}

function YourLoads({ liftValue, sets, oneRmGrams }: { liftValue: string; sets: StrengthSet[]; oneRmGrams: number | null }) {
  const liftLabel = LIFT_NAMES.find((l) => l.value === liftValue)?.label ?? liftValue
  return (
    <Card className="mb-3 border-accent p-5">
      <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent-ink">
        Your loads · {liftLabel}
      </div>
      {oneRmGrams === null ? (
        <div className="text-[13px] text-ink-3">
          {sets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
          {' — '}
          <Link href="/dashboard/lifts" className="text-accent-ink underline transition-colors hover:text-ink">
            Log your {liftLabel} 1RM
          </Link> to see kg.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sets.map((s, i) => (
            <div key={i} className="flex items-baseline gap-2.5">
              <span className="min-w-24 font-mono text-[13px] text-ink-2">
                {s.sets}×{s.reps} @ {s.percentage}%
              </span>
              <span className="font-mono text-xl font-bold text-ink">
                {loadForPercent(oneRmGrams, s.percentage).barKg}
              </span>
              <span className="font-mono text-[11px] text-ink-faint">kg</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default async function WodPage({ searchParams }: { searchParams: { date?: string } }) {
  const { supabase, user, profile, boxName } = await requirePage()

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const today = todayInTimezone(timezone)
  const isStaff = ['owner', 'coach'].includes(profile.role)

  // Athletes can only view the current week
  const wStart = weekStart(today)
  const wEnd = weekEnd(today)
  const rawDate = searchParams.date ?? today
  const date = !isStaff && (rawDate < wStart || rawDate > wEnd) ? today : rawDate
  const isToday = date === today

  const { data: wod } = await supabase
    .from('workouts')
    .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets, scaling')
    .eq('box_id', profile.box_id)
    .eq('date', date)
    .single()

  const { data: scores } = wod
    ? await supabase
        .from('workout_scores')
        .select('athlete_id, score_value, rx, notes, is_pr, profiles(full_name)')
        .eq('workout_id', wod.id)
    : { data: null }

  const myScore = scores?.find((s) => s.athlete_id === user.id) ?? null

  const { data: myLift } = wod?.strength_lift
    ? await supabase
        .from('athlete_lifts')
        .select('one_rm_grams')
        .eq('athlete_id', user.id)
        .eq('lift_name', wod.strength_lift)
        .maybeSingle()
    : { data: null }

  const pagerClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }))
  const pagerDisabledClass =
    'cursor-not-allowed rounded-lg border border-line px-3 py-1.5 text-sm text-ink-faint'

  return (
    <DashboardShell
      active="wod"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Daily WOD"
    >
      <div className="max-w-2xl">
        {/* Date navigation */}
        <Card className="mb-6 flex items-center justify-between px-4 py-3">
          {(!isStaff && date <= wStart) ? (
            <span className={pagerDisabledClass}>← Prev</span>
          ) : (
            <Link href={`/dashboard/wod?date=${prevDay(date)}`} className={pagerClass}>← Prev</Link>
          )}
          <div className="text-center">
            <div className="text-sm font-semibold text-ink">{formatDate(date)}</div>
            {!isToday && (
              <Link href="/dashboard/wod" className="text-xs text-accent-ink transition-colors hover:text-ink">
                Back to today
              </Link>
            )}
          </div>
          {(!isStaff && date >= wEnd) ? (
            <span className={pagerDisabledClass}>Next →</span>
          ) : (
            <Link href={`/dashboard/wod?date=${nextDay(date)}`} className={pagerClass}>Next →</Link>
          )}
        </Card>

        {/* Strength card */}
        {wod?.strength_title && (
          <Card className="mb-3 p-5">
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
              Strength
            </div>
            <div className={cn('font-display text-xl font-bold tracking-[-0.02em] text-ink', wod.strength_description && 'mb-2.5')}>
              {wod.strength_title}
            </div>
            {wod.strength_description && (
              <pre className="m-0 whitespace-pre-wrap font-mono text-[13.5px] leading-relaxed text-ink-2">
                {wod.strength_description}
              </pre>
            )}
          </Card>
        )}

        {/* Your personal loads (the Wedge) */}
        {wod?.strength_lift && (
          <YourLoads
            liftValue={wod.strength_lift}
            sets={(wod.strength_sets ?? []) as StrengthSet[]}
            oneRmGrams={myLift?.one_rm_grams ?? null}
          />
        )}

        {/* WOD hero — brand-dark in both themes (like the auth BrandPanel) */}
        {wod && (
          <div className="relative mb-4 overflow-hidden rounded-2xl bg-[#0A0A0A] p-6">
            <div className="absolute -right-14 -top-14 h-[200px] w-[200px] rounded-full border-2 border-[#C8F135] opacity-20" />
            <div className="relative">
              <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[#C8F135]">
                {SCORING_LABELS[wod.scoring_type] ?? wod.scoring_type}
              </div>
              <div className="mb-3 font-display text-4xl font-bold tracking-[-0.03em] text-[#C8F135]">
                {wod.title}
              </div>
              <pre className="m-0 whitespace-pre-wrap font-mono text-sm leading-relaxed text-[#FAFAFA]/85">
                {wod.description}
              </pre>
              {((wod.scaling ?? []) as import('./_lib/validation').ScalingTier[]).length > 0 && (
                <div className="mt-4 flex flex-col gap-2.5">
                  {((wod.scaling ?? []) as import('./_lib/validation').ScalingTier[]).map((t, i) => (
                    <div key={i}>
                      <span className="font-mono text-xs font-bold uppercase tracking-[0.06em] text-[#C8F135]">
                        {t.label}
                      </span>
                      <div className="mt-0.5 whitespace-pre-wrap font-mono text-[13.5px] text-[#FAFAFA]/80">
                        {t.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scores */}
        {wod && (
          <div className="mb-4">
            <ScoreSection
              workoutId={wod.id}
              scoringType={wod.scoring_type}
              myScore={myScore ?? null}
              scores={scores ?? []}
            />
          </div>
        )}

        {/* Staff WOD form */}
        {isStaff && (
          <Card className="p-5">
            <p className="mb-3.5 text-[13px] font-semibold text-ink">
              {wod ? 'Edit WOD' : 'Post WOD'}
            </p>
            <WodForm date={date} existing={wod ? {
              title: wod.title,
              description: wod.description,
              scoring_type: wod.scoring_type,
              strength_title: wod.strength_title,
              strength_description: wod.strength_description,
              strength_lift: wod.strength_lift,
              strength_sets: wod.strength_sets,
              scaling: wod.scaling as import('./_lib/validation').ScalingTier[] | null,
            } : null} />
          </Card>
        )}

        {!wod && !isStaff && (
          <Card className="px-6 py-12 text-center text-[13px] text-ink-3">
            No WOD posted for this day yet.
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}
