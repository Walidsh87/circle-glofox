'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { logScore, type WodPrInfo } from '../_actions/log-score'

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

function prBlurb(pr: WodPrInfo): string {
  const bracket = pr.rx ? 'Rx' : 'Scaled'
  if (pr.scoringType === 'time') {
    return `🏆 ${bracket} ${pr.benchmark} PR! −${Math.round(pr.prevBest - pr.newScore)}s`
  }
  const unit = pr.scoringType === 'load_kg' ? 'kg' : 'reps'
  return `🏆 ${bracket} ${pr.benchmark} PR! +${pr.newScore - pr.prevBest} ${unit}`
}

const inputStyle: React.CSSProperties = {
  height: 38, padding: '0 12px',
  border: '1px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none',
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 38, padding: '0 18px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 8,
        fontSize: 13.5, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        transition: 'opacity 120ms', flexShrink: 0,
      }}
    >
      {pending ? 'Saving…' : label}
    </button>
  )
}

type Score = {
  athlete_id: string
  score_value: number
  rx: boolean
  is_pr: boolean
  notes: string | null
  profiles: { full_name: string } | { full_name: string }[] | null
}

export function ScoreSection({
  workoutId, scoringType, myScore, scores,
}: {
  workoutId: string
  scoringType: string
  myScore: Score | null
  scores: Score[]
}) {
  const [state, formAction] = useFormState(logScore, { error: null, pr: null })

  const isTimeBased = scoringType === 'time'
  const hint = isTimeBased
    ? 'Seconds (180 = 3:00)'
    : scoringType === 'load_kg' ? 'Weight (kg)' : 'Total reps'

  const sorted = [...scores].sort((a, b) =>
    isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Score entry */}
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 14 }}>
          {myScore ? 'Update your score' : 'Log your score'}
        </div>
        <form action={formAction}>
          <input type="hidden" name="workoutId" value={workoutId} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {hint}
              </label>
              <input
                name="scoreValue"
                type="number"
                min={0}
                step={isTimeBased ? 1 : 0.5}
                required
                defaultValue={myScore?.score_value ?? ''}
                placeholder={isTimeBased ? '180' : '0'}
                style={{ ...inputStyle, width: 110 }}
              />
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 500, color: 'var(--c-ink-2)',
              cursor: 'pointer', paddingBottom: 2,
            }}>
              <input
                name="rx"
                type="checkbox"
                defaultChecked={myScore?.rx ?? false}
                style={{ width: 15, height: 15, accentColor: 'var(--circle-lime)', cursor: 'pointer' }}
              />
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em' }}>RX</span>
            </label>

            <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Notes
              </label>
              <input
                name="notes"
                type="text"
                defaultValue={myScore?.notes ?? ''}
                placeholder="Optional"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            <SubmitButton label={myScore ? 'Update' : 'Log score'} />
          </div>
          {state.error && (
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</p>
          )}
          {state.pr && (
            <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>{prBlurb(state.pr)}</p>
          )}
        </form>
      </div>

      {/* Leaderboard */}
      {sorted.length > 0 && (
        <div style={{
          background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
        }}>
          <div style={{
            padding: '12px 18px', borderBottom: '1px solid var(--c-divider)',
            background: 'var(--c-surface-sunk)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>Leaderboard</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
              {sorted.length} athlete{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {sorted.map((s, i) => {
                const athleteProfile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
                const isFirst = i === 0
                return (
                  <tr key={s.athlete_id} style={{
                    borderBottom: i < sorted.length - 1 ? '1px solid var(--c-divider)' : 'none',
                    background: isFirst ? 'var(--circle-lime-soft)' : 'transparent',
                  }}>
                    <td style={{ padding: '11px 16px', width: 36 }}>
                      <span className="mono" style={{
                        fontSize: 13, fontWeight: 700,
                        color: isFirst ? 'var(--circle-lime-ink)' : 'var(--c-ink-faint)',
                      }}>{i + 1}</span>
                    </td>
                    <td style={{ padding: '11px 8px', fontWeight: 600, fontSize: 13.5, color: 'var(--c-ink)' }}>
                      {athleteProfile?.full_name ?? '—'}
                    </td>
                    <td style={{ padding: '11px 8px' }}>
                      {s.rx && (
                        <span className="mono" style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                          padding: '2px 6px', borderRadius: 4,
                          background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)',
                        }}>RX</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {s.is_pr && <span title="PR when logged" style={{ marginRight: 6 }}>🏆</span>}
                      <span className="mono" style={{
                        fontSize: isFirst ? 17 : 15, fontWeight: 700,
                        color: isFirst ? 'var(--circle-lime-ink)' : 'var(--c-ink)',
                        letterSpacing: '-0.01em',
                      }}>
                        {formatScore(s.score_value, scoringType)}
                      </span>
                    </td>
                    {s.notes && (
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: 'var(--c-ink-faint)' }}>{s.notes}</span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
