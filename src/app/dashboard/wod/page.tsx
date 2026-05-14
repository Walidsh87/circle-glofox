import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { WodForm } from './_components/wod-form'
import { ScoreSection } from './_components/score-section'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai':   4,
  'Asia/Muscat':  4,
  'Asia/Riyadh':  3,
  'Asia/Qatar':   3,
  'Asia/Kuwait':  3,
  'Asia/Bahrain': 3,
}

const SCORING_LABELS: Record<string, string> = {
  time:        'For Time',
  rounds_reps: 'AMRAP (rounds + reps)',
  load_kg:     'Max Load (kg)',
  amrap:       'AMRAP (total reps)',
}

function todayInTimezone(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localMs = Date.now() + offsetHours * 60 * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
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

export default async function WodPage({
  searchParams,
}: {
  searchParams: { date?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const { data: box } = await supabase
    .from('boxes')
    .select('timezone')
    .eq('id', profile.box_id)
    .single()

  const timezone = box?.timezone ?? 'Asia/Dubai'
  const today = todayInTimezone(timezone)
  const date = searchParams.date ?? today
  const isToday = date === today
  const isStaff = ['owner', 'coach'].includes(profile.role)

  const { data: wod } = await supabase
    .from('workouts')
    .select('id, title, description, scoring_type')
    .eq('box_id', profile.box_id)
    .eq('date', date)
    .single()

  const { data: scores } = wod
    ? await supabase
        .from('workout_scores')
        .select('athlete_id, score_value, rx, notes, profiles(full_name)')
        .eq('workout_id', wod.id)
    : { data: null }

  const myScore = scores?.find((s) => s.athlete_id === user.id) ?? null


  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">WOD</h1>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link href={`/dashboard/wod?date=${prevDay(date)}`}
            className="text-sm px-3 py-1 rounded-md border hover:bg-white">
            ← Prev
          </Link>
          <div className="text-center">
            <p className="font-semibold">{formatDate(date)}</p>
            {!isToday && (
              <Link href="/dashboard/wod" className="text-xs text-primary hover:underline">
                Back to today
              </Link>
            )}
          </div>
          <Link href={`/dashboard/wod?date=${nextDay(date)}`}
            className="text-sm px-3 py-1 rounded-md border hover:bg-white">
            Next →
          </Link>
        </div>

        {/* WOD display */}
        {wod && (
          <div className="bg-white rounded-xl border p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold">{wod.title}</h2>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {SCORING_LABELS[wod.scoring_type] ?? wod.scoring_type}
                </span>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-gray-700 text-sm leading-relaxed">
              {wod.description}
            </pre>
          </div>
        )}

        {/* Score logging + leaderboard */}
        {wod && (
          <div className="mb-6">
            <ScoreSection
              workoutId={wod.id}
              scoringType={wod.scoring_type}
              myScore={myScore ?? null}
              scores={scores ?? []}
            />
          </div>
        )}

        {/* Form for staff */}
        {isStaff && (
          <div className="bg-white rounded-xl border p-6">
            <p className="text-sm font-medium text-gray-700 mb-4">
              {wod ? 'Edit WOD' : 'Post WOD'}
            </p>
            <WodForm date={date} existing={wod ?? null} />
          </div>
        )}

        {/* No WOD, not staff */}
        {!wod && !isStaff && (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            No WOD posted for this day yet.
          </div>
        )}
      </div>
    </main>
  )
}
