'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { saveTemplate } from '../_actions/save-template'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'

const SCORING_TYPES = [
  { value: 'time',        label: 'For Time' },
  { value: 'rounds_reps', label: 'AMRAP (rounds + reps)' },
  { value: 'load_kg',     label: 'Max Load (kg)' },
  { value: 'amrap',       label: 'AMRAP (total reps)' },
]

const inputClass =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const monoAreaClass =
  'w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const labelClass = 'font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3'

export type TemplateExisting = {
  id: string; title: string; description: string; scoring_type: string
  strength_title: string | null; strength_description: string | null
  strength_lift: string | null; strength_sets: StrengthSet[] | null
} | null

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Update template' : 'Save template'}
    </Button>
  )
}

export function TemplateForm({ existing, onSaved }: { existing: TemplateExisting; onSaved?: () => void }) {
  const [state, formAction] = useFormState(async (prev: { error: string | null }, fd: FormData) => {
    const res = await saveTemplate(prev, fd)
    if (!res.error) onSaved?.()
    return res
  }, { error: null })
  const [lift, setLift] = useState(existing?.strength_lift ?? '')
  const [sets, setSets] = useState<StrengthSet[]>(existing?.strength_sets ?? [])

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      {existing && <input type="hidden" name="id" value={existing.id} />}

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Title</label>
        <input name="title" type="text" required defaultValue={existing?.title ?? ''} placeholder="Fran, Murph…" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Scoring</label>
        <select name="scoringType" required defaultValue={existing?.scoring_type ?? 'time'} className={inputClass}>
          {SCORING_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Description</label>
        <textarea
          name="description"
          required
          rows={5}
          defaultValue={existing?.description ?? ''}
          placeholder={'21-15-9 reps for time:\nThrusters\nPull-ups'}
          className={monoAreaClass}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface-2 px-3.5 py-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">Strength (optional)</span>
        <input name="strengthTitle" type="text" defaultValue={existing?.strength_title ?? ''} placeholder="Back Squat…" className={inputClass} />
        <textarea
          name="strengthDescription"
          rows={2}
          defaultValue={existing?.strength_description ?? ''}
          placeholder={'5x5 @ 75%'}
          className={monoAreaClass}
        />
        <select name="strengthLift" value={lift} onChange={(e) => { setLift(e.target.value); if (!e.target.value) setSets([]) }} className={inputClass}>
          <option value="">No % prescription</option>
          {LIFT_NAMES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        {lift && (
          <div className="flex flex-col gap-1.5">
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input type="number" min={1} value={s.sets} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, sets: Number(e.target.value) } : x))} className={`${inputClass} w-16`} aria-label="sets" />
                <span className="font-mono text-ink-3">×</span>
                <input type="number" min={1} value={s.reps} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, reps: Number(e.target.value) } : x))} className={`${inputClass} w-16`} aria-label="reps" />
                <span className="font-mono text-ink-3">@</span>
                <input type="number" min={1} max={200} value={s.percentage} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, percentage: Number(e.target.value) } : x))} className={`${inputClass} w-[72px]`} aria-label="percentage" />
                <span className="font-mono text-ink-3">%</span>
                <button
                  type="button"
                  onClick={() => setSets((p) => p.filter((_, idx) => idx !== i))}
                  className="ml-auto text-lg text-danger transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label="remove set"
                >×</button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setSets((p) => [...p, { sets: 5, reps: 3, percentage: 80 }])}
            >
              + Add set
            </Button>
          </div>
        )}
        <input type="hidden" name="strengthSets" value={JSON.stringify(sets)} />
      </div>

      {state.error && <p role="alert" className="m-0 text-xs text-danger">{state.error}</p>}
      <div><SubmitButton isEdit={!!existing} /></div>
    </form>
  )
}
