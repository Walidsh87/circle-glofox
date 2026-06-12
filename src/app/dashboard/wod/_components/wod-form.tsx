'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { saveWod } from '../_actions/save-wod'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet, ScalingTier } from '../_lib/validation'

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
const sectionClass = 'flex flex-col gap-3 rounded-[10px] border border-line bg-surface-2 px-4 py-3.5'
const sectionTitleClass = 'font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3'
const removeBtnClass =
  'ml-auto text-lg leading-none text-danger transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Update WOD' : 'Post WOD'}
    </Button>
  )
}

type Wod = {
  title: string
  description: string
  scoring_type: string
  strength_title?: string | null
  strength_description?: string | null
  strength_lift?: string | null
  strength_sets?: StrengthSet[] | null
  scaling?: ScalingTier[] | null
} | null

export function WodForm({ date, existing }: { date: string; existing: Wod }) {
  const [state, formAction] = useFormState(saveWod, { error: null })
  const [lift, setLift] = useState(existing?.strength_lift ?? '')
  const [sets, setSets] = useState<StrengthSet[]>(existing?.strength_sets ?? [])

  function updateSet(i: number, key: keyof StrengthSet, value: number) {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)))
  }
  function addSet() {
    setSets((prev) => [...prev, { sets: 5, reps: 3, percentage: 80 }])
  }
  function removeSet(i: number) {
    setSets((prev) => prev.filter((_, idx) => idx !== i))
  }

  const [scaling, setScaling] = useState<ScalingTier[]>(existing?.scaling ?? [])
  function updateTier(i: number, key: keyof ScalingTier, value: string) {
    setScaling((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)))
  }
  function addTier() {
    const SUGGESTED = ['Rx', 'Scaled', 'Beginner']
    setScaling((prev) => [...prev, { label: SUGGESTED[prev.length] ?? '', description: '' }])
  }
  function removeTier(i: number) {
    setScaling((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="date" value={date} />

      {/* Strength section */}
      <div className={sectionClass}>
        <span className={sectionTitleClass}>Strength (optional)</span>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Movement</label>
          <input
            name="strengthTitle"
            type="text"
            defaultValue={existing?.strength_title ?? ''}
            placeholder="Back Squat, Deadlift, Clean & Jerk…"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Program</label>
          <textarea
            name="strengthDescription"
            rows={3}
            defaultValue={existing?.strength_description ?? ''}
            placeholder={'5x5 @ 75%\nRest 2 min between sets'}
            className={monoAreaClass}
          />
        </div>

        {/* The Wedge — structured % prescription */}
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className={labelClass}>% Loading (optional · powers per-athlete loads)</label>
          <select
            name="strengthLift"
            value={lift}
            onChange={(e) => setLift(e.target.value)}
            className={inputClass}
          >
            <option value="">No % prescription</option>
            {LIFT_NAMES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          {lift && (
            <div className="flex flex-col gap-1.5">
              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="number" min={1} value={s.sets}
                    onChange={(e) => updateSet(i, 'sets', Number(e.target.value))}
                    className={`${inputClass} w-16`} aria-label="sets" />
                  <span className="font-mono text-[13px] text-ink-3">×</span>
                  <input type="number" min={1} value={s.reps}
                    onChange={(e) => updateSet(i, 'reps', Number(e.target.value))}
                    className={`${inputClass} w-16`} aria-label="reps" />
                  <span className="font-mono text-[13px] text-ink-3">@</span>
                  <input type="number" min={1} max={200} value={s.percentage}
                    onChange={(e) => updateSet(i, 'percentage', Number(e.target.value))}
                    className={`${inputClass} w-[72px]`} aria-label="percentage" />
                  <span className="font-mono text-[13px] text-ink-3">%</span>
                  <button type="button" onClick={() => removeSet(i)} className={removeBtnClass} aria-label="remove set">×</button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={addSet}>
                + Add set
              </Button>
            </div>
          )}
          <input type="hidden" name="strengthSets" value={JSON.stringify(sets)} />
        </div>
      </div>

      {/* WOD section */}
      <div className={sectionClass}>
        <span className={sectionTitleClass}>WOD</span>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Title</label>
          <input
            name="title"
            type="text"
            required
            defaultValue={existing?.title ?? ''}
            placeholder="Fran, Murph, 21-15-9…"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Scoring</label>
          <select
            name="scoringType"
            required
            defaultValue={existing?.scoring_type ?? 'time'}
            className={inputClass}
          >
            {SCORING_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Description</label>
          <textarea
            name="description"
            required
            rows={6}
            defaultValue={existing?.description ?? ''}
            placeholder={'21-15-9 reps for time:\nThrusters (43/30 kg)\nPull-ups'}
            className={monoAreaClass}
          />
        </div>
      </div>

      {/* Scaling section */}
      <div className={sectionClass}>
        <span className={sectionTitleClass}>Scaling options (optional)</span>
        {scaling.map((t, i) => (
          <div key={i} className={i > 0 ? 'flex flex-col gap-1.5 border-t border-line pt-2.5' : 'flex flex-col gap-1.5'}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={t.label}
                onChange={(e) => updateTier(i, 'label', e.target.value)}
                placeholder="Rx"
                className={`${inputClass} w-40`}
                aria-label="tier label"
              />
              <button type="button" onClick={() => removeTier(i)} className={removeBtnClass} aria-label="remove tier">×</button>
            </div>
            <textarea
              value={t.description}
              onChange={(e) => updateTier(i, 'description', e.target.value)}
              rows={2}
              placeholder="42.5/30kg thrusters, pull-ups"
              className={monoAreaClass}
              aria-label="tier description"
            />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={addTier}>
          + Add scaling tier
        </Button>
        <input type="hidden" name="scaling" value={JSON.stringify(scaling)} />
      </div>

      {state.error && <p role="alert" className="m-0 text-xs text-danger">{state.error}</p>}
      <div>
        <SubmitButton isEdit={!!existing} />
      </div>
    </form>
  )
}
