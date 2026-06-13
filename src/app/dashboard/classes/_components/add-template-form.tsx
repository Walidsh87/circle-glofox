'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createTemplate } from '../_actions/create-template'
import { Button } from '@/components/ui/button'
import { useEffect, useRef } from 'react'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const inputClass =
  'rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Adding...' : 'Add class'}
    </Button>
  )
}

type Coach = { id: string; full_name: string }

export function AddTemplateForm({ coaches, season = 'default' }: { coaches: Coach[]; season?: string }) {
  const [state, formAction] = useFormState(createTemplate, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <input
        name="name"
        type="text"
        required
        placeholder="Class name (e.g. CrossFit 6 AM)"
        className={`${inputClass} sm:col-span-2`}
      />
      <select name="weekday" required className={inputClass}>
        {WEEKDAYS.map((day, i) => (
          <option key={i} value={i}>{day}</option>
        ))}
      </select>
      <input name="startTime" type="time" required defaultValue="06:00" className={inputClass} />
      <input
        name="capacity"
        type="number"
        min={1}
        max={100}
        defaultValue={12}
        placeholder="Capacity"
        className={inputClass}
      />
      <select name="coachId" className={inputClass}>
        <option value="">No coach</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name}</option>
        ))}
      </select>
      <input name="durationMinutes" type="hidden" value={60} />
      <input name="season" type="hidden" value={season} />
      <div className="col-span-2 flex items-center gap-3 sm:col-span-6">
        <SubmitButton />
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  )
}
