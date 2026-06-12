'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { editTemplate } from '../_actions/edit-template'
import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const inputClass =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const labelClass = 'mb-1 block text-xs font-medium text-ink-3'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving...' : 'Save changes'}
    </Button>
  )
}

type Coach = { id: string; full_name: string }

type Props = {
  templateId: string
  defaultName: string
  defaultWeekday: number
  defaultStartTime: string
  defaultCapacity: number
  defaultCoachId: string | null
  coaches: Coach[]
  onSuccess: () => void
}

export function EditTemplateForm({
  templateId,
  defaultName,
  defaultWeekday,
  defaultStartTime,
  defaultCapacity,
  defaultCoachId,
  coaches,
  onSuccess,
}: Props) {
  const boundAction = editTemplate.bind(null, templateId)
  const [state, formAction] = useFormState(boundAction, { error: null })

  useEffect(() => {
    if (state.saved) onSuccess()
  }, [state.saved, onSuccess])

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label className={labelClass}>Class name</label>
        <input
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          placeholder="e.g. CrossFit 6 AM"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelClass}>Day</label>
          <select name="weekday" required defaultValue={defaultWeekday} className={inputClass}>
            {WEEKDAYS.map((day, i) => (
              <option key={i} value={i}>{day}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Start time</label>
          <input name="startTime" type="time" required defaultValue={defaultStartTime} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelClass}>Capacity</label>
          <input
            name="capacity"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={defaultCapacity}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Coach</label>
          <select name="coachId" defaultValue={defaultCoachId ?? ''} className={inputClass}>
            <option value="">No coach</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <SubmitButton />
        {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      </div>
    </form>
  )
}
