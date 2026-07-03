'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { logSets, deleteSetDay } from '../_actions/log-sets'
import type { LoggableExercise } from '../_lib/load-program'
import { bestSet, dayBests, formatDuration, parseDuration, type SetLog } from '@/lib/program-log'
import type { ExerciseMetric } from '@/lib/program'
import { Sparkline } from '@/app/dashboard/kpi/_components/sparkline'

const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'
const input = 'h-8 w-16 rounded-lg border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

const kg = (g: number | null) => (g == null ? '—' : String(Math.round(g / 100) / 10))

const setLabel = (s: SetLog, metric: ExerciseMetric): string => {
  if (metric === 'time') return s.duration_seconds != null ? formatDuration(s.duration_seconds) : '—'
  if (metric === 'distance') return s.distance_meters != null ? `${s.distance_meters}m` : '—'
  if (metric === 'calories') return s.calories != null ? `${s.calories} cal` : '—'
  return `${kg(s.weight_grams)}×${s.reps ?? '—'}`
}
const daySummary = (sets: SetLog[], metric: ExerciseMetric) => sets.map((s) => setLabel(s, metric)).join(', ')

const METRIC_PLACEHOLDER: Record<ExerciseMetric, string> = { load: 'kg', time: 'm:ss', distance: 'meters', calories: 'cal' }

type Row = { weight: string; reps: string; value: string }

export function ExerciseLogger({ exercise, today, videoUrl }: { exercise: LoggableExercise; today: string; videoUrl?: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const metric = exercise.metric

  const prescription = [exercise.sets ? `${exercise.sets}×${exercise.reps || '—'}` : exercise.reps, exercise.lift_name && exercise.percentage ? `@ ${exercise.percentage}%` : null]
    .filter(Boolean)
    .join(' ')
  const loggedToday = exercise.logDays.find((d) => d.date === today)
  const last = exercise.logDays[0]

  const allLogs = exercise.logDays.flatMap((d) => d.sets.map((s) => ({ ...s, performed_on: d.date })))
  const best = bestSet(allLogs, metric)
  const bests = dayBests(exercise.logDays, metric)
  const prDates = new Set(bests.filter((b) => b.isPr).map((b) => b.date))
  // Time charts read better inverted (down = faster); keep raw values for the others.
  const chartValues = bests.map((b) => (metric === 'time' ? -b.value : b.value))

  const defaultRows = (): Row[] => {
    const count = exercise.sets ?? last?.sets.length ?? 1
    const prefillWeight = metric === 'load' && exercise.load ? String(exercise.load.barKg) : ''
    const prefillReps = metric === 'load' && /^\d+$/.test(exercise.reps) ? exercise.reps : ''
    return Array.from({ length: Math.min(count, 50) }, () => ({ weight: prefillWeight, reps: prefillReps, value: '' }))
  }
  const [rows, setRows] = useState<Row[]>(defaultRows)

  function save() {
    const entries = rows.map((r, i) => {
      const base = { setNumber: i + 1, weightKg: null, reps: null, durationSeconds: null, distanceMeters: null, calories: null }
      if (metric === 'load') {
        return { ...base, weightKg: r.weight.trim() === '' ? null : Number(r.weight), reps: r.reps.trim() === '' ? null : Number(r.reps) }
      }
      if (metric === 'time') return { ...base, durationSeconds: parseDuration(r.value) }
      if (metric === 'distance') return { ...base, distanceMeters: r.value.trim() === '' ? null : Number(r.value) }
      return { ...base, calories: r.value.trim() === '' ? null : Number(r.value) }
    })
    start(async () => {
      const res = await logSets(exercise.id, today, entries)
      if (res.error) { alert(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  function removeDay(date: string) {
    if (!confirm('Delete this day’s log?')) return
    start(async () => {
      const res = await deleteSetDay(exercise.id, date)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="border-b border-line py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-ink">
            {exercise.name}
            {videoUrl && (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-[11px] text-accent-ink underline" title="Watch demo">▶ demo</a>
            )}
          </div>
          <div className="text-[12px] text-ink-3">
            {prescription}
            {exercise.target_note ? ` · ${exercise.target_note}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {metric === 'load' && exercise.load ? (
            <span className="font-mono text-[13px] font-semibold text-accent-ink">{exercise.load.barKg} kg</span>
          ) : metric === 'load' && exercise.needsOneRm ? (
            <Link href="/dashboard/lifts" className="text-[11px] text-ink-3 underline">set your 1RM</Link>
          ) : null}
          <button type="button" className={loggedToday ? btn : limeBtn} onClick={() => { setRows(defaultRows()); setOpen((o) => !o) }}>
            {loggedToday ? 'Logged ✓ · edit' : 'Log sets'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-ink-3">
              <span className="w-10">Set {i + 1}</span>
              {metric === 'load' ? (
                <>
                  <input className={input} type="number" min="0" placeholder="kg" value={r.weight} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
                  <span>×</span>
                  <input className={input} type="number" min="0" placeholder="reps" value={r.reps} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)))} />
                </>
              ) : (
                <input
                  className={`${input} w-24`}
                  type={metric === 'time' ? 'text' : 'number'}
                  min="1"
                  inputMode={metric === 'time' ? 'numeric' : undefined}
                  placeholder={METRIC_PLACEHOLDER[metric]}
                  value={r.value}
                  onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                />
              )}
              {i === rows.length - 1 && <button type="button" className={btn} onClick={() => setRows((p) => p.slice(0, -1))}>−</button>}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button type="button" className={btn} onClick={() => setRows((p) => [...p, { weight: '', reps: '', value: '' }])}>+ set</button>
            <div className="flex-1" />
            <button type="button" className={limeBtn} disabled={pending} onClick={save}>{pending ? 'Saving…' : `Save (${today})`}</button>
            <button type="button" className={btn} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {exercise.logDays.length > 0 && (
        <div className="mt-1.5">
          {!showHistory ? (
            <button type="button" className="text-[11px] text-ink-3 underline" onClick={() => setShowHistory(true)}>
              Last {last.date}: {daySummary(last.sets, metric)} · history ({exercise.logDays.length})
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              {best && (
                <div className="text-[11.5px] text-ink-2">
                  Best: <span className="font-mono font-semibold text-accent-ink">{setLabel(best, metric)}</span>
                  <span className="text-ink-3"> ({best.performed_on})</span>
                </div>
              )}
              {chartValues.length >= 2 && <Sparkline values={chartValues} width={200} height={36} />}
              {exercise.logDays.map((d) => (
                <div key={d.date} className="flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
                  <span>
                    <span className="font-mono">{d.date}</span> — {daySummary(d.sets, metric)}
                    {prDates.has(d.date) && <span className="ml-1.5 rounded bg-accent-soft px-1 font-mono text-[10px] font-semibold text-accent-ink">PR</span>}
                  </span>
                  <button type="button" className={btn} disabled={pending} onClick={() => removeDay(d.date)}>×</button>
                </div>
              ))}
              <button type="button" className="self-start text-[11px] text-ink-3 underline" onClick={() => setShowHistory(false)}>hide</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
