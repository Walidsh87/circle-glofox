'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveLift } from '../_actions/save-lift'
import { Button } from '@/components/ui/button'
import { useEffect, useRef } from 'react'
import { LIFT_NAMES } from '../_lib/lift-names'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : 'Save 1RM'}
    </Button>
  )
}

type Lift = { lift_name: string; one_rm_grams: number }

export function LiftForm({ lifts }: { lifts: Lift[] }) {
  const [state, formAction] = useFormState(saveLift, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  const liftMap = Object.fromEntries(lifts.map((l) => [l.lift_name, l.one_rm_grams / 1000]))

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lift</label>
        <select
          name="liftName"
          required
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select lift</option>
          {LIFT_NAMES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}{liftMap[l.value] ? ` (current: ${liftMap[l.value]}kg)` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">1RM (kg)</label>
        <input
          name="weightKg"
          type="number"
          min={1}
          max={500}
          step={0.5}
          required
          placeholder="e.g. 100"
          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-3 pb-0.5">
        <SubmitButton />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  )
}
