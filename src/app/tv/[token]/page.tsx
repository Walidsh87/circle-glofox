import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { CircleMark } from '@/components/circle-mark'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { sortLeaderboard } from '../_lib/leaderboard'
import { AutoRefresh } from '../_components/auto-refresh'

export const dynamic = 'force-dynamic'

const SCORING_LABEL: Record<string, string> = { time: 'For Time', rounds_reps: 'Rounds + Reps', load_kg: 'Max Load', amrap: 'AMRAP' }

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
}
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
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: box } = await service
    .from('boxes')
    .select('id, name, timezone')
    .eq('tv_token', token)
    .maybeSingle()
  if (!box) notFound()

  const timezone = box.timezone ?? 'Asia/Dubai'
  const todayIso = todayLocalDate(timezone)

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
    <div className="circle-dark" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-geist-sans)' }}>
      <AutoRefresh seconds={30} />

      <header style={{ height: 72, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 40px', gap: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: 'var(--c-ink)' }}>
          <CircleMark size={26} onDark />
          <span>{box.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="c-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--circle-lime)' }} />
          <span className="mono" style={{ fontSize: 14, color: 'var(--circle-lime)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live</span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 16, color: 'var(--c-ink-muted)' }}>{today}</div>
      </header>

      <div style={{ flex: 1, padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: 26, minHeight: 0 }}>
        {wod ? (
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 18, padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 44, fontWeight: 700, color: 'var(--c-ink)', letterSpacing: '-0.02em', margin: 0 }}>{wod.title}</h1>
              <span className="mono" style={{ fontSize: 14, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{SCORING_LABEL[wod.scoring_type] ?? wod.scoring_type}</span>
            </div>
            <div style={{ fontSize: 22, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{wod.description}</div>
            {strengthLabel && strengthSets.length > 0 && (
              <div className="mono" style={{ marginTop: 16, fontSize: 16, color: 'var(--circle-lime-ink)' }}>
                Strength · {strengthLabel} · {strengthSets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
              </div>
            )}
            {((wod.scaling ?? []) as { label: string; description: string }[]).length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {((wod.scaling ?? []) as { label: string; description: string }[]).map((t, i) => (
                  <div key={i} style={{ flex: '1 1 260px' }}>
                    <div className="mono" style={{ fontSize: 13, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</div>
                    <div style={{ fontSize: 18, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.4, marginTop: 2 }}>{t.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--c-ink-muted)', fontSize: 32, fontFamily: 'var(--font-space-grotesk)' }}>No WOD posted today.</div>
        )}

        {wod && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, flex: 1, minHeight: 0 }}>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)', fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>Leaderboard</div>
              {leaderboard.length === 0 ? (
                <p style={{ padding: '20px 22px', fontSize: 16, color: 'var(--c-ink-faint)' }}>No scores logged yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {leaderboard.map((s, i) => (
                      <tr key={s.athlete_id} style={{ borderBottom: i < leaderboard.length - 1 ? '1px solid var(--c-divider)' : 'none', background: i === 0 ? 'var(--circle-lime-soft)' : 'transparent' }}>
                        <td className="mono" style={{ padding: '12px 22px', width: 44, fontSize: 18, fontWeight: 700, color: i === 0 ? 'var(--circle-lime-ink)' : 'var(--c-ink-faint)' }}>{i + 1}</td>
                        <td style={{ padding: '12px 8px', fontSize: 19, fontWeight: 600, color: 'var(--c-ink)' }}>{s.name}</td>
                        <td style={{ padding: '12px 8px' }}>
                          {s.rx && <span className="mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>RX</span>}
                          {s.is_pr && <span style={{ marginLeft: 6 }}>🏆</span>}
                        </td>
                        <td className="mono" style={{ padding: '12px 22px', textAlign: 'right', fontSize: i === 0 ? 24 : 20, fontWeight: 700, color: i === 0 ? 'var(--circle-lime-ink)' : 'var(--c-ink)' }}>{formatScore(s.score_value, wod.scoring_type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)', fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>🏆 PRs Today</div>
              {prs.length === 0 ? (
                <p style={{ padding: '20px 22px', fontSize: 15, color: 'var(--c-ink-faint)' }}>No PRs yet today.</p>
              ) : (
                <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {prs.map((p, i) => (
                    <div key={i} style={{ fontSize: 17, color: 'var(--c-ink)' }}>
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                      <span style={{ color: 'var(--c-ink-muted)' }}> — {p.what}</span>
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
