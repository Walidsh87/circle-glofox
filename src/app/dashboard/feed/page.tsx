import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { cn } from '@/lib/utils'
import { FistBumpButton } from './_components/fist-bump-button'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { mergeTimeline, type FeedItem, type ScoreItem, type PrItem, type AchievementItem } from './_lib/merge-feed'

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
  const { supabase, user, profile, boxName } = await requirePage()

  const { data: scores } = await supabase
    .from('workout_scores')
    .select('id, score_value, rx, is_pr, logged_at, athlete_id, profiles(full_name), workouts(title, scoring_type)')
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

  const { data: achievements } = await supabase
    .from('member_achievements')
    .select('id, kind, threshold, earned_at, athlete_id, profiles(full_name)')
    .eq('box_id', profile.box_id)
    .order('earned_at', { ascending: false })
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
      scoreValue: s.score_value, rx: s.rx, isPr: s.is_pr,
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

  const achievementItems: FeedItem[] = (achievements ?? []).map((a): AchievementItem => {
    const athlete = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
    return {
      kind: 'achievement', id: a.id, at: a.earned_at,
      athleteId: a.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      achievementKind: a.kind, threshold: a.threshold,
    }
  })

  const items = mergeTimeline(scoreItems, prItems, achievementItems)

  return (
    <DashboardShell
      active="feed"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Activity Feed"
    >
      <div className="flex max-w-[560px] flex-col gap-2.5">
        {items.length > 0 ? items.map((item) => (
          item.kind === 'achievement'
            ? <AchievementCard key={`ach-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
            : item.kind === 'pr'
              ? <PrCard key={`pr-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
              : item.kind === 'score'
                ? <ScoreCard key={`score-${item.id}`} item={item} isSelf={item.athleteId === user.id} reaction={reactionsByScore[item.id] ?? { count: 0, reacted: false }} />
                : null
        )) : (
          <div className="rounded-[14px] border border-line bg-surface px-6 py-12 text-center text-[13px] text-ink-3">
            No activity yet. Log a WOD result or hit a lift PR to get started.
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function Avatar({ name, isSelf }: { name: string; isSelf: boolean }) {
  return (
    <div className={cn(
      'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold',
      isSelf ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink-2'
    )}>
      {initials(name)}
    </div>
  )
}

function ScoreCard({ item, isSelf, reaction }: { item: ScoreItem; isSelf: boolean; reaction: { count: number; reacted: boolean } }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-surface px-4 py-4 shadow-card">
      <Avatar name={item.athleteName} isSelf={isSelf} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink">{item.athleteName}</span>
          <span className="text-[12.5px] text-ink-3">{item.wodTitle}</span>
          <span className="font-mono text-[11px] text-ink-faint">{formatDate(item.at)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-ink">
            {formatScore(item.scoreValue, item.scoringType)}
          </span>
          {item.rx && (
            <span className="rounded bg-ok-soft px-1 py-px font-mono text-[10px] font-bold text-ok">RX</span>
          )}
          {item.isPr && <span title="Personal record" className="text-[13px]">🏆</span>}
        </div>
      </div>
      <FistBumpButton scoreId={item.id} initialCount={reaction.count} initialReacted={reaction.reacted} />
    </div>
  )
}

function PrCard({ item, isSelf }: { item: PrItem; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[14px] border border-accent bg-surface px-4 py-4 shadow-card">
      <Avatar name={item.athleteName} isSelf={isSelf} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink">{item.athleteName}</span>
          <span className="text-[12.5px] text-ink-3">🏆 {liftLabel(item.liftName)} PR</span>
          <span className="font-mono text-[11px] text-ink-faint">{formatDate(item.at)}</span>
        </div>
        <div className="mt-1">
          <span className="font-mono text-lg font-bold text-accent-ink">{item.kg} kg</span>
        </div>
      </div>
    </div>
  )
}

function AchievementCard({ item, isSelf }: { item: AchievementItem; isSelf: boolean }) {
  const emoji = item.achievementKind === 'milestone' ? '🏅' : '🔥'
  const text = item.achievementKind === 'milestone'
    ? `joined the ${item.threshold} Club`
    : `hit a ${item.threshold}-week streak`
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-[14px] border px-4 py-3.5 shadow-card',
      isSelf ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
    )}>
      <span className="text-[22px]">{emoji}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
        <span className="text-[13.5px] font-semibold text-ink">{item.athleteName}</span>
        <span className="text-[12.5px] text-ink-3">{text}</span>
        <span className="font-mono text-[11px] text-ink-faint">{formatDate(item.at)}</span>
      </div>
    </div>
  )
}
