'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { saveProgram } from '../_actions/program'
import type { ProgramExercise, ProgramInput, ProgramSession } from '@/lib/program'
import type { EditableProgram } from '@/app/dashboard/program/_lib/load-program'

const input = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'

const newExercise = (): ProgramExercise => ({ client_uid: crypto.randomUUID(), name: '', lift_name: null, sets: 5, reps: '5', percentage: null, target_note: null, rest_seconds: null })
const newSession = (n: number): ProgramSession => ({ client_uid: crypto.randomUUID(), title: `Day ${n}`, exercises: [newExercise()] })

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

type SaveFn = (programId: string | null, input: ProgramInput) => Promise<{ error: string | null; programId?: string; templateId?: string }>

export function ProgramBuilder({
  athleteId,
  initial,
  showWeek,
  onSave,
}: {
  athleteId: string
  initial: EditableProgram | null
  showWeek?: boolean
  onSave?: SaveFn
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [programId] = useState<string | null>(initial?.id ?? null)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [sessions, setSessions] = useState<ProgramSession[]>(initial?.sessions?.length ? initial.sessions : [newSession(1)])

  const patchSession = (si: number, patch: Partial<ProgramSession>) =>
    setSessions((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)))
  const patchExercise = (si: number, ei: number, patch: Partial<ProgramExercise>) =>
    setSessions((prev) => prev.map((s, i) => (i === si ? { ...s, exercises: s.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) } : s)))

  function save() {
    start(async () => {
      const input: ProgramInput = { title, notes: notes || null, sessions }
      if (onSave) {
        const res = await onSave(programId, input)
        if (res.error) { alert(res.error); return }
        router.refresh()
      } else {
        const res = await saveProgram(athleteId, programId, input)
        if (res.error) { alert(res.error); return }
        router.push(`/dashboard/members/${athleteId}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-4">
        <input className={`${input} h-9`} placeholder="Program title (e.g. 8-week strength block)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={`${input} py-2 leading-normal`} placeholder="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {sessions.map((s, si) => (
        <div key={s.client_uid} className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3.5">
          <div className="flex items-center gap-2">
            <input className={`${input} flex-1 font-semibold`} placeholder="Session title" value={s.title} maxLength={80} onChange={(e) => patchSession(si, { title: e.target.value })} />
            {showWeek && (
              <input
                className={`${input} w-16`}
                type="number"
                min={1}
                placeholder="Week"
                value={s.week ?? ''}
                onChange={(e) => patchSession(si, { week: e.target.value ? Number(e.target.value) : null })}
              />
            )}
            <button type="button" className={btn} disabled={si === 0} onClick={() => setSessions((p) => move(p, si, -1))}>↑</button>
            <button type="button" className={btn} disabled={si === sessions.length - 1} onClick={() => setSessions((p) => move(p, si, 1))}>↓</button>
            <button type="button" className={btn} onClick={() => setSessions((p) => p.filter((_, i) => i !== si))}>Remove</button>
          </div>

          {s.exercises.map((ex, ei) => (
            <div key={ex.client_uid} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
              <input className={`${input} min-w-[140px] flex-1`} placeholder="Exercise name" value={ex.name} maxLength={80} onChange={(e) => patchExercise(si, ei, { name: e.target.value })} />
              <select
                className={input}
                value={ex.lift_name ?? ''}
                onChange={(e) => patchExercise(si, ei, { lift_name: e.target.value || null, percentage: e.target.value ? ex.percentage : null })}
              >
                <option value="">— no 1RM link —</option>
                {LIFT_NAMES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <input className={`${input} w-14`} type="number" min="1" placeholder="sets" value={ex.sets ?? ''} onChange={(e) => patchExercise(si, ei, { sets: e.target.value ? Number(e.target.value) : null })} />
              <span className="text-[11px] text-ink-3">×</span>
              <input className={`${input} w-16`} placeholder="reps" value={ex.reps} maxLength={20} onChange={(e) => patchExercise(si, ei, { reps: e.target.value })} />
              {ex.lift_name && (
                <>
                  <span className="text-[11px] text-ink-3">@</span>
                  <input className={`${input} w-14`} type="number" min="1" max="200" placeholder="%" value={ex.percentage ?? ''} onChange={(e) => patchExercise(si, ei, { percentage: e.target.value ? Number(e.target.value) : null })} />
                </>
              )}
              <input className={`${input} w-28`} placeholder="note (RPE 8…)" value={ex.target_note ?? ''} maxLength={60} onChange={(e) => patchExercise(si, ei, { target_note: e.target.value || null })} />
              <button type="button" className={btn} disabled={ei === 0} onClick={() => patchSession(si, { exercises: move(s.exercises, ei, -1) })}>↑</button>
              <button type="button" className={btn} disabled={ei === s.exercises.length - 1} onClick={() => patchSession(si, { exercises: move(s.exercises, ei, 1) })}>↓</button>
              <button type="button" className={btn} onClick={() => patchSession(si, { exercises: s.exercises.filter((_, j) => j !== ei) })}>×</button>
            </div>
          ))}
          <button type="button" className={`${btn} self-start`} onClick={() => patchSession(si, { exercises: [...s.exercises, newExercise()] })}>+ Add exercise</button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => setSessions((p) => [...p, newSession(p.length + 1)])}>+ Add session</button>
        <div className="flex-1" />
        <button type="button" className={btn} disabled={pending} onClick={() => router.push(`/dashboard/members/${athleteId}`)}>Cancel</button>
        <button type="button" className={limeBtn} disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save program'}</button>
      </div>
    </div>
  )
}
