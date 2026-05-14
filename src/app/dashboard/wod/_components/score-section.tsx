'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { logScore } from '../_actions/log-score'
import { Button } from '@/components/ui/button'

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : label}
    </Button>
  )
}

type Score = {
  athlete_id: string
  score_value: number
  rx: boolean
  notes: string | null
  profiles: { full_name: string } | { full_name: string }[] | null
}

export function ScoreSection({
  workoutId,
  scoringType,
  myScore,
  scores,
}: {
  workoutId: string
  scoringType: string
  myScore: Score | null
  scores: Score[]
}) {
  const [state, formAction] = useFormState(logScore, { error: null })

  const isTimeBased = scoringType === 'time'
  const hint = isTimeBased
    ? 'Enter seconds (e.g. 180 = 3:00)'
    : scoringType === 'load_kg'
    ? 'Enter weight in kg'
    : 'Enter total reps'

  const sorted = [...scores].sort((a, b) =>
    isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value
  )

  return (
    <div className="space-y-4">
      {/* Score entry */}
      <div className="bg-white rounded-xl border p-5">
        <p className="text-sm font-medium text-gray-700 mb-4">
          {myScore ? 'Update your score' : 'Log your score'}
        </p>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="workoutId" value={workoutId} />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{hint}</label>
              <input
                name="scoreValue"
                type="number"
                min={0}
                step={isTimeBased ? 1 : 0.5}
                required
                defaultValue={myScore?.score_value ?? ''}
                placeholder={isTimeBased ? '180' : '0'}
                className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-1 cursor-pointer">
              <input
                name="rx"
                type="checkbox"
                defaultChecked={myScore?.rx ?? false}
                className="rounded"
              />
              RX
            </label>
            <div className="flex-1 min-w-32">
              <input
                name="notes"
                type="text"
                defaultValue={myScore?.notes ?? ''}
                placeholder="Notes (optional)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <SubmitButton label={myScore ? 'Update' : 'Log score'} />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </form>
      </div>

      {/* Leaderboard */}
      {sorted.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Leaderboard</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {sorted.map((s, i) => {
                const athleteProfile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
                return (
                  <tr key={s.athlete_id} className="border-b last:border-0">
                    <td className="px-4 py-3 w-8 font-bold text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{athleteProfile?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {s.rx && (
                        <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded mr-2">
                          RX
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatScore(s.score_value, scoringType)}
                    </td>
                    {s.notes && (
                      <td className="px-4 py-3 text-right text-xs text-gray-400">{s.notes}</td>
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
