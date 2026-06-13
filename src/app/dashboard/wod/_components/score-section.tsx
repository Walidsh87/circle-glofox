'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { logScore, type WodPrInfo } from '../_actions/log-score'
import { useT } from '@/components/i18n/locale-provider'

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
  const delta = Math.round((pr.newScore - pr.prevBest) * 100) / 100
  return `🏆 ${bracket} ${pr.benchmark} PR! +${delta} ${unit}`
}

const inputClass =
  'h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const labelClass = 'font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  const t = useT()
  return (
    <Button type="submit" disabled={pending} className="shrink-0">
      {pending ? t('common.saving') : label}
    </Button>
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
  const t = useT()

  const isTimeBased = scoringType === 'time'
  const hint = isTimeBased
    ? t('wod.score.secondsHint')
    : scoringType === 'load_kg' ? t('wod.score.weightHint') : t('wod.score.repsHint')

  const sorted = [...scores].sort((a, b) =>
    isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Score entry */}
      <Card className="p-5">
        <div className="mb-3.5 text-[13px] font-semibold text-ink">
          {myScore ? t('wod.score.updateHeading') : t('wod.score.logHeading')}
        </div>
        <form action={formAction}>
          <input type="hidden" name="workoutId" value={workoutId} />
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{hint}</label>
              <input
                name="scoreValue"
                type="number"
                min={0}
                step={isTimeBased ? 1 : 0.5}
                required
                defaultValue={myScore?.score_value ?? ''}
                placeholder={isTimeBased ? '180' : '0'}
                className={`${inputClass} w-28`}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-[13px] font-medium text-ink-2">
              <input
                name="rx"
                type="checkbox"
                defaultChecked={myScore?.rx ?? false}
                className="h-[15px] w-[15px] cursor-pointer accent-[var(--accent)]"
              />
              <span className="font-mono text-xs font-bold tracking-[0.05em]">{t('common.rx')}</span>
            </label>

            <div className="flex min-w-[140px] flex-1 flex-col gap-1">
              <label className={labelClass}>{t('wod.score.notes')}</label>
              <input
                name="notes"
                type="text"
                defaultValue={myScore?.notes ?? ''}
                placeholder={t('wod.score.notesPlaceholder')}
                className={`${inputClass} w-full`}
              />
            </div>

            <SubmitButton label={myScore ? t('wod.score.updateButton') : t('wod.score.logButton')} />
          </div>
          {state.error && <p role="alert" className="mt-2 text-xs text-danger">{state.error}</p>}
          {state.pr && <p className="mt-2 text-xs font-bold text-accent-ink">{prBlurb(state.pr)}</p>}
        </form>
      </Card>

      {/* Leaderboard */}
      {sorted.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
            <span className="text-[13px] font-semibold text-ink">{t('wod.leaderboard.title')}</span>
            <span className="font-mono text-[11px] text-ink-3">
              {t('wod.leaderboard.athleteCount', { count: sorted.length, plural: sorted.length !== 1 ? 's' : '' })}
            </span>
          </div>
          <table className="w-full">
            <tbody>
              {sorted.map((s, i) => {
                const athleteProfile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
                const isFirst = i === 0
                return (
                  <tr
                    key={s.athlete_id}
                    className={cn('border-b border-line last:border-0', isFirst && 'bg-accent-soft')}
                  >
                    <td className="w-9 px-4 py-2.5">
                      <span className={cn('font-mono text-[13px] font-bold', isFirst ? 'text-accent-ink' : 'text-ink-faint')}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-[13.5px] font-semibold text-ink">
                      {athleteProfile?.full_name ?? t('common.dash')}
                    </td>
                    <td className="px-2 py-2.5">
                      {s.rx && (
                        <span className="rounded bg-ok-soft px-1.5 py-px font-mono text-[10px] font-bold tracking-[0.05em] text-ok">
                          {t('common.rx')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.is_pr && <span title={t('wod.leaderboard.prTitle')} className="me-1.5">🏆</span>}
                      <span className={cn('font-mono font-bold', isFirst ? 'text-[17px] text-accent-ink' : 'text-[15px] text-ink')}>
                        {formatScore(s.score_value, scoringType)}
                      </span>
                    </td>
                    {s.notes && (
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-xs text-ink-3">{s.notes}</span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
