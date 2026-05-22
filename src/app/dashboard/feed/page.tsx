import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { FistBumpButton } from './_components/fist-bump-button'

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

export default async function FeedPage() {
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

  const { data: scores } = await supabase
    .from('workout_scores')
    .select('id, score_value, rx, logged_at, athlete_id, profiles(full_name), workouts(title, scoring_type)')
    .eq('box_id', profile.box_id)
    .order('logged_at', { ascending: false })
    .limit(30)

  const { data: reactions } = await supabase
    .from('score_reactions')
    .select('score_id, athlete_id')
    .eq('box_id', profile.box_id)

  const reactionsByScore = (reactions ?? []).reduce<Record<string, { count: number; reacted: boolean }>>((acc, r) => {
    if (!acc[r.score_id]) acc[r.score_id] = { count: 0, reacted: false }
    acc[r.score_id].count++
    if (r.athlete_id === user.id) acc[r.score_id].reacted = true
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="feed" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Activity Feed
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scores && scores.length > 0 ? scores.map((s) => {
              const athlete = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
              const wod = Array.isArray(s.workouts) ? s.workouts[0] : s.workouts
              const r = reactionsByScore[s.id] ?? { count: 0, reacted: false }
              return (
                <div key={s.id} style={{
                  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                  borderRadius: 14, padding: '16px 18px',
                  boxShadow: 'var(--c-shadow-sm)',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: s.athlete_id === user.id ? 'var(--circle-lime)' : 'var(--c-surface-alt)',
                    color: s.athlete_id === user.id ? 'var(--circle-ink)' : 'var(--c-ink-2)',
                    display: 'grid', placeItems: 'center',
                    fontWeight: 700, fontSize: 13,
                  }}>
                    {initials(athlete?.full_name ?? '?')}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>
                        {athlete?.full_name ?? 'Athlete'}
                      </span>
                      <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
                        {wod?.title ?? 'WOD'}
                      </span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>
                        {formatDate(s.logged_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-ink)' }}>
                        {wod ? formatScore(s.score_value, wod.scoring_type) : s.score_value}
                      </span>
                      {s.rx && (
                        <span className="mono" style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 5px',
                          borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)',
                        }}>RX</span>
                      )}
                    </div>
                  </div>

                  {/* Fist bump */}
                  <FistBumpButton scoreId={s.id} initialCount={r.count} initialReacted={r.reacted} />
                </div>
              )
            }) : (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                color: 'var(--c-ink-muted)', fontSize: 13,
              }}>
                No scores logged yet. Be the first to post a WOD result.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
