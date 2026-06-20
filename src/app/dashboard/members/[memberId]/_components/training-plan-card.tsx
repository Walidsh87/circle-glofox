'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTrainingPlan, setPlanActive, deleteTrainingPlan } from '../_actions/training-plan'
// import type only — load-goals.ts is server-only (DB reads); never import its values here.
import type { TrainingPlan } from '@/app/dashboard/goals/_lib/load-goals'

const input = 'rounded-lg border border-line-strong bg-surface px-2.5 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'

export function TrainingPlanCard({ athleteId, plans, canManage }: { athleteId: string; plans: TrainingPlan[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  // Athletes only see active plans; staff see all (and manage).
  const visible = canManage ? plans : plans.filter((p) => p.active)

  function run(fn: () => Promise<{ error: string | null }>, after?: () => void) {
    start(async () => {
      const r = await fn()
      if (r.error) { alert(r.error); return }
      after?.()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 && !adding && (
        <p className="text-[13px] text-ink-3">{canManage ? 'No training plan assigned.' : 'No plan assigned yet.'}</p>
      )}

      {visible.map((p) => (
        <div key={p.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              {p.title}
              {!p.active && <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-bold text-ink-3">inactive</span>}
            </div>
            {canManage && (
              <div className="flex shrink-0 gap-1">
                <button type="button" className={btn} disabled={pending} onClick={() => run(() => setPlanActive(p.id, !p.active, athleteId))}>
                  {p.active ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" className={btn} disabled={pending} onClick={() => { if (confirm('Remove this plan?')) run(() => deleteTrainingPlan(p.id, athleteId)) }}>Delete</button>
              </div>
            )}
          </div>
          {p.body && <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-normal text-ink-2">{p.body}</p>}
        </div>
      ))}

      {canManage && !adding && (
        <button type="button" className={`${btn} self-start`} onClick={() => setAdding(true)}>+ Assign plan</button>
      )}

      {canManage && adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 px-3 py-3">
          <input placeholder="Plan title (e.g. 8-week strength block)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={`${input} h-9`} />
          <textarea
            placeholder="Plan details — focus areas, weekly structure, notes…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={5}
            className={`${input} py-2 leading-normal`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={limeBtn}
              disabled={pending}
              onClick={() => run(() => addTrainingPlan(athleteId, title, body), () => { setAdding(false); setTitle(''); setBody('') })}
            >
              {pending ? 'Saving…' : 'Assign plan'}
            </button>
            <button type="button" className={btn} disabled={pending} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
