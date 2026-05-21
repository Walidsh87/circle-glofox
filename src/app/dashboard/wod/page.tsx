import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
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

export default async function WodPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

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
    .select('id, title, description, scoring_type, strength_title, strength_description')
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="wod" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0, gap: 12,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            Daily WOD
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            {/* Date navigation */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 24,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 12, padding: '12px 16px',
              boxShadow: 'var(--c-shadow-sm)',
            }}>
              {(!isStaff && date <= wStart) ? (
                <span style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-faint)', cursor: 'not-allowed' }}>← Prev</span>
              ) : (
                <Link href={`/dashboard/wod?date=${prevDay(date)}`} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-2)', textDecoration: 'none' }}>← Prev</Link>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c-ink)' }}>{formatDate(date)}</div>
                {!isToday && (
                  <Link href="/dashboard/wod" style={{ fontSize: 12, color: 'var(--circle-lime-ink)', textDecoration: 'none' }}>
                    Back to today
                  </Link>
                )}
              </div>
              {(!isStaff && date >= wEnd) ? (
                <span style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-faint)', cursor: 'not-allowed' }}>Next →</span>
              ) : (
                <Link href={`/dashboard/wod?date=${nextDay(date)}`} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-2)', textDecoration: 'none' }}>Next →</Link>
              )}
            </div>

            {/* Strength card */}
            {wod?.strength_title && (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '20px 24px', marginBottom: 12,
                boxShadow: 'var(--c-shadow-sm)',
              }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                  Strength
                </div>
                <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 700, color: 'var(--c-ink)', letterSpacing: '-0.02em', marginBottom: wod.strength_description ? 10 : 0 }}>
                  {wod.strength_title}
                </div>
                {wod.strength_description && (
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-geist-mono)', fontSize: 13.5, color: 'var(--c-ink-2)', lineHeight: 1.7, margin: 0 }}>
                    {wod.strength_description}
                  </pre>
                )}
              </div>
            )}

            {/* WOD card */}
            {wod && (
              <div style={{
                background: 'var(--circle-ink)', borderRadius: 16, padding: '24px 28px',
                marginBottom: 16, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: '50%', border: '2px solid var(--circle-lime)', opacity: 0.2 }} />
                <div style={{ position: 'relative' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                    {SCORING_LABELS[wod.scoring_type] ?? wod.scoring_type}
                  </div>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 36, fontWeight: 700, color: 'var(--circle-lime)', letterSpacing: '-0.03em', marginBottom: 12 }}>
                    {wod.title}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-geist-mono)', fontSize: 14, color: 'rgba(250,250,250,0.85)', lineHeight: 1.7, margin: 0 }}>
                    {wod.description}
                  </pre>
                </div>
              </div>
            )}

            {/* Scores */}
            {wod && (
              <div style={{ marginBottom: 16 }}>
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
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--c-shadow-sm)',
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 14 }}>
                  {wod ? 'Edit WOD' : 'Post WOD'}
                </p>
                <WodForm date={date} existing={wod ? {
                  title: wod.title,
                  description: wod.description,
                  scoring_type: wod.scoring_type,
                  strength_title: wod.strength_title,
                  strength_description: wod.strength_description,
                } : null} />
              </div>
            )}

            {!wod && !isStaff && (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                color: 'var(--c-ink-muted)', fontSize: 13,
              }}>
                No WOD posted for this day yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
