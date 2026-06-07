import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { FistBumpButton } from './_components/fist-bump-button'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { mergeTimeline, type FeedItem, type ScoreItem, type PrItem } from './_lib/merge-feed'

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

function liftLabel(value: string): string {
  return LIFT_NAMES.find((l) => l.value === value)?.label ?? value
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

  const { data: prs } = await supabase
    .from('athlete_lifts_history')
    .select('id, lift_name, one_rm_grams, created_at, athlete_id, profiles(full_name)')
    .eq('box_id', profile.box_id)
    .eq('is_pr', true)
    .order('created_at', { ascending: false })
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

  const scoreItems: FeedItem[] = (scores ?? []).map((s): ScoreItem => {
    const athlete = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
    const wod = Array.isArray(s.workouts) ? s.workouts[0] : s.workouts
    return {
      kind: 'score', id: s.id, at: s.logged_at,
      athleteId: s.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      wodTitle: wod?.title ?? 'WOD', scoringType: wod?.scoring_type ?? '',
      scoreValue: s.score_value, rx: s.rx,
    }
  })

  const prItems: FeedItem[] = (prs ?? []).map((p): PrItem => {
    const athlete = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
    return {
      kind: 'pr', id: p.id, at: p.created_at,
      athleteId: p.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      liftName: p.lift_name, kg: p.one_rm_grams / 1000,
    }
  })

  const items = mergeTimeline(scoreItems, prItems)

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
            {items.length > 0 ? items.map((item) => (
              item.kind === 'pr'
                ? <PrCard key={`pr-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
                : <ScoreCard key={`score-${item.id}`} item={item} isSelf={item.athleteId === user.id} reaction={reactionsByScore[item.id] ?? { count: 0, reacted: false }} />
            )) : (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                color: 'var(--c-ink-muted)', fontSize: 13,
              }}>
                No activity yet. Log a WOD result or hit a lift PR to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Avatar({ name, isSelf }: { name: string; isSelf: boolean }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: isSelf ? 'var(--circle-lime)' : 'var(--c-surface-alt)',
      color: isSelf ? 'var(--circle-ink)' : 'var(--c-ink-2)',
      display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13,
    }}>
      {initials(name)}
    </div>
  )
}

function ScoreCard({ item, isSelf, reaction }: { item: ScoreItem; isSelf: boolean; reaction: { count: number; reacted: boolean } }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--c-shadow-sm)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <Avatar name={item.athleteName} isSelf={isSelf} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{item.athleteName}</span>
          <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{item.wodTitle}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>{formatDate(item.at)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-ink)' }}>
            {formatScore(item.scoreValue, item.scoringType)}
          </span>
          {item.rx && (
            <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>RX</span>
          )}
        </div>
      </div>
      <FistBumpButton scoreId={item.id} initialCount={reaction.count} initialReacted={reaction.reacted} />
    </div>
  )
}

function PrCard({ item, isSelf }: { item: PrItem; isSelf: boolean }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--circle-lime)',
      borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--c-shadow-sm)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <Avatar name={item.athleteName} isSelf={isSelf} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{item.athleteName}</span>
          <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>🏆 {liftLabel(item.liftName)} PR</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>{formatDate(item.at)}</span>
        </div>
        <div style={{ marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>{item.kg} kg</span>
        </div>
      </div>
    </div>
  )
}
