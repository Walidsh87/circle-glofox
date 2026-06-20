import { Card } from '@/components/ui/card'
import { getServerT } from '@/lib/i18n/server'
import { formatLiftName, formatScore } from '../_lib/profile-format'

export type LiftRow = { lift_name: string; one_rm_grams: number }
type WodRef = { title: string; scoring_type: string }
export type ScoreRow = { score_value: number; rx: boolean | null; workouts: WodRef | WodRef[] | null }

const rowClass = 'border-b border-line last:border-0'

/** Side-by-side 1RM lifts + recent WOD scores tables. */
export async function LiftsScoresCards({ lifts, scores }: { lifts: LiftRow[] | null; scores: ScoreRow[] | null }) {
  const t = await getServerT()
  return (
    <div className="mb-4 grid gap-4 md:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-4 py-3">
          <span className="text-[13px] font-semibold text-ink">{t('profile.lifts.section')}</span>
        </div>
        {lifts && lifts.length > 0 ? (
          <table className="w-full">
            <tbody>
              {lifts.map((lift) => (
                <tr key={lift.lift_name} className={rowClass}>
                  <td className="px-4 py-2.5 text-[13.5px] text-ink-2">{formatLiftName(lift.lift_name)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <span className="font-mono text-[15px] font-bold text-ink">
                      {(lift.one_rm_grams / 1000).toFixed(1)} kg
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-7 text-center text-[13px] text-ink-3">{t('profile.lifts.empty')}</div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-4 py-3">
          <span className="text-[13px] font-semibold text-ink">{t('profile.scores.section')}</span>
        </div>
        {scores && scores.length > 0 ? (
          <table className="w-full">
            <tbody>
              {scores.map((s, i) => {
                const wod = Array.isArray(s.workouts) ? s.workouts[0] : s.workouts
                return (
                  <tr key={i} className={rowClass}>
                    <td className="px-4 py-2.5 text-[13px] text-ink-2">{wod?.title ?? '—'}</td>
                    <td className="px-4 py-2.5 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.rx && (
                          <span className="rounded bg-ok-soft px-1 py-px font-mono text-[9.5px] font-bold text-ok">{t('common.rx')}</span>
                        )}
                        <span className="font-mono text-sm font-bold text-ink">
                          {wod ? formatScore(s.score_value, wod.scoring_type) : s.score_value}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-7 text-center text-[13px] text-ink-3">{t('profile.scores.empty')}</div>
        )}
      </Card>
    </div>
  )
}
