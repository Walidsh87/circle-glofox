'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { SKILL_BESTS, SKILL_BEST_CATEGORIES, skillByKey, parseTimeToSeconds, formatBestValue, toStoredValue } from '@/lib/skill-bests'
import { setGoal, setGoalStatus, markGoalDone, deleteGoal } from '../_actions/goals'
// import type only — load-goals.ts is server-only (DB reads); never import its values here.
import type { GoalWithProgress } from '@/app/dashboard/goals/_lib/load-goals'
import type { GoalInput, GoalType } from '@/lib/goals'

const input = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'

const TYPE_LABELS: Record<GoalType, string> = {
  lift_1rm: '1RM lift',
  skill_best: 'Skill best',
  attendance: 'Attendance',
  custom: 'Custom',
}

export function GoalsCard({ athleteId, goals, canManage }: { athleteId: string; goals: GoalWithProgress[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<GoalType>('lift_1rm')
  const [title, setTitle] = useState('')
  const [liftName, setLiftName] = useState(LIFT_NAMES[0].value)
  const [targetKg, setTargetKg] = useState('')
  const [skillKey, setSkillKey] = useState(SKILL_BESTS[0].key)
  const [targetBest, setTargetBest] = useState('')
  const [targetCount, setTargetCount] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const skillMeasure = skillByKey(skillKey)?.measure ?? 'reps'

  const activeGoals = goals.filter((g) => g.status === 'active')
  const archivedGoals = goals.filter((g) => g.status === 'archived')

  function run(fn: () => Promise<{ error: string | null }>, after?: () => void) {
    start(async () => {
      const r = await fn()
      if (r.error) { alert(r.error); return }
      after?.()
      router.refresh()
    })
  }

  function autoTitle(): string {
    if (type === 'lift_1rm') return `${LIFT_NAMES.find((l) => l.value === liftName)?.label ?? liftName} → ${targetKg}kg`
    if (type === 'skill_best') {
      const stored = toStoredValue(skillKey, targetBest)
      return `${skillByKey(skillKey)?.label ?? skillKey} → ${stored !== null ? formatBestValue(skillKey, stored) : targetBest}`
    }
    if (type === 'attendance') return `${targetCount} sessions`
    return title.trim()
  }

  function submit() {
    // skill_best target: weight goes over as kg (server converts to grams);
    // reps/meters as an integer; time is converted mm:ss → seconds here.
    const bestTarget =
      skillMeasure === 'time' ? parseTimeToSeconds(targetBest) : (targetBest === '' ? null : Number(targetBest))
    const payload: GoalInput = {
      goalType: type,
      title: title.trim() || autoTitle(),
      liftName: type === 'lift_1rm' ? liftName : null,
      targetKg: type === 'lift_1rm' ? Number(targetKg) : type === 'skill_best' && skillMeasure === 'weight' ? bestTarget : null,
      skillKey: type === 'skill_best' ? skillKey : null,
      targetCount:
        type === 'attendance' ? Number(targetCount) : type === 'skill_best' && skillMeasure !== 'weight' ? bestTarget : null,
      targetDate: targetDate || null,
    }
    run(() => setGoal(athleteId, payload), () => {
      setAdding(false); setTitle(''); setTargetKg(''); setTargetBest(''); setTargetCount(''); setTargetDate('')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {goals.length === 0 && !adding && <p className="text-[13px] text-ink-3">No goals yet.</p>}

      {activeGoals.map((g) => (
        <div key={g.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                {g.title}
                {g.progress.met && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">✓ Achieved</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-3">
                {TYPE_LABELS[g.goal_type]} · {g.progress.label}
                {g.target_date && <> · by {g.target_date}</>}
              </div>
            </div>
            {canManage && (
              <div className="flex shrink-0 gap-1">
                {g.goal_type === 'custom' && (
                  <button type="button" className={btn} disabled={pending} onClick={() => run(() => markGoalDone(g.id, !g.achieved_at, athleteId))}>
                    {g.achieved_at ? 'Undo' : 'Done'}
                  </button>
                )}
                <button type="button" className={btn} disabled={pending} onClick={() => run(() => setGoalStatus(g.id, 'archived', athleteId))}>Archive</button>
              </div>
            )}
          </div>
          {g.goal_type !== 'custom' && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${g.progress.pct}%` }} />
            </div>
          )}
        </div>
      ))}

      {archivedGoals.length > 0 && (
        <details className="text-[12px] text-ink-3">
          <summary className="cursor-pointer">Archived ({archivedGoals.length})</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {archivedGoals.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-ink-2">{g.title}</span>
                {canManage && (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className={btn} disabled={pending} onClick={() => run(() => setGoalStatus(g.id, 'active', athleteId))}>Restore</button>
                    <button type="button" className={btn} disabled={pending} onClick={() => { if (confirm('Delete this goal?')) run(() => deleteGoal(g.id, athleteId)) }}>Delete</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {canManage && !adding && (
        <button type="button" className={`${btn} self-start`} onClick={() => setAdding(true)}>+ Add goal</button>
      )}

      {canManage && adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as GoalType)} className={input}>
              {(Object.keys(TYPE_LABELS) as GoalType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>

            {type === 'lift_1rm' && (
              <>
                <select value={liftName} onChange={(e) => setLiftName(e.target.value)} className={input}>
                  {LIFT_NAMES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <input type="number" min="1" placeholder="Target kg" value={targetKg} onChange={(e) => setTargetKg(e.target.value)} className={`${input} w-24`} />
              </>
            )}
            {type === 'skill_best' && (
              <>
                <select value={skillKey} onChange={(e) => { setSkillKey(e.target.value); setTargetBest('') }} className={input}>
                  {SKILL_BEST_CATEGORIES.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {SKILL_BESTS.filter((s) => s.category === cat).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                {skillMeasure === 'time' ? (
                  <input placeholder="Target mm:ss" value={targetBest} onChange={(e) => setTargetBest(e.target.value)} className={`${input} w-28`} />
                ) : (
                  <input
                    type="number"
                    min="1"
                    step={skillMeasure === 'weight' ? '0.5' : '1'}
                    placeholder={skillMeasure === 'weight' ? 'Target kg' : skillMeasure === 'distance_m' ? 'Target m' : 'Target reps'}
                    value={targetBest}
                    onChange={(e) => setTargetBest(e.target.value)}
                    className={`${input} w-28`}
                  />
                )}
              </>
            )}
            {type === 'attendance' && (
              <input type="number" min="1" placeholder="Sessions" value={targetCount} onChange={(e) => setTargetCount(e.target.value)} className={`${input} w-28`} />
            )}
          </div>

          {type === 'custom' && (
            <input placeholder="Goal (e.g. Lose 5kg, compete in a comp)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={`${input} h-9`} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-ink-3">Target date (optional)</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={input} />
          </div>

          <div className="flex gap-2">
            <button type="button" className={limeBtn} disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Save goal'}</button>
            <button type="button" className={btn} disabled={pending} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
