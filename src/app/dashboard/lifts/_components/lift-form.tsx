'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveLift, type PrInfo } from '../_actions/save-lift'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { LIFT_NAMES } from '../_lib/lift-names'

function prLabel(pr: PrInfo): string {
  return LIFT_NAMES.find((l) => l.value === pr.liftName)?.label ?? pr.liftName
}

const inputClass =
  'h-[38px] rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'h-[38px] rounded-lg px-[18px] text-[13.5px] font-bold tracking-[0.01em] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        pending ? 'cursor-not-allowed bg-surface-2 text-ink-3' : 'bg-accent text-accent-contrast hover:bg-accent-hover'
      )}
    >
      {pending ? 'Saving…' : 'Save 1RM'}
    </button>
  )
}

type Lift = { lift_name: string; one_rm_grams: number }

export function LiftForm({ lifts }: { lifts: Lift[] }) {
  const [state, formAction] = useFormState(saveLift, { error: null, pr: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  const liftMap = Object.fromEntries(lifts.map((l) => [l.lift_name, l.one_rm_grams / 1000]))

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2.5">
      <div className="flex flex-col gap-[5px]">
        <label className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
          Lift
        </label>
        <select name="liftName" required className={cn(inputClass, 'min-w-[200px] pr-2')}>
          <option value="">Select lift</option>
          {LIFT_NAMES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}{liftMap[l.value] ? ` (current: ${liftMap[l.value]}kg)` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-[5px]">
        <label className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
          1RM (kg)
        </label>
        <input
          name="weightKg"
          type="number"
          min={1} max={500} step={0.5}
          required
          placeholder="e.g. 100"
          className={cn(inputClass, 'w-[110px]')}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <SubmitButton />
        {state.error && (
          <span className="text-[12.5px] text-danger">{state.error}</span>
        )}
        {state.pr && (
          <span className="text-[12.5px] font-bold text-accent-ink">
            🏆 {prLabel(state.pr)} PR! {state.pr.newKg}kg — +{state.pr.deltaKg}kg over your previous best
          </span>
        )}
      </div>
    </form>
  )
}
