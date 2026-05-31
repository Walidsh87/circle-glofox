'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { editTemplate } from '../_actions/edit-template'
import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

  const inputStyle = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--c-border)',
    background: 'var(--c-background)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    color: 'var(--c-ink)',
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
          Class name
        </label>
        <input
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          placeholder="e.g. CrossFit 6 AM"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Day
          </label>
          <select name="weekday" required defaultValue={defaultWeekday} style={inputStyle}>
            {WEEKDAYS.map((day, i) => (
              <option key={i} value={i}>{day}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Start time
          </label>
          <input
            name="startTime"
            type="time"
            required
            defaultValue={defaultStartTime}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Capacity
          </label>
          <input
            name="capacity"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={defaultCapacity}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-ink-muted)', display: 'block', marginBottom: 4 }}>
            Coach
          </label>
          <select name="coachId" defaultValue={defaultCoachId ?? ''} style={inputStyle}>
            <option value="">No coach</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <SubmitButton />
        {state.error && (
          <p style={{ fontSize: 12, color: 'var(--c-destructive)' }}>{state.error}</p>
        )}
      </div>
    </form>
  )
}
