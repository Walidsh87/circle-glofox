'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveWod } from '../_actions/save-wod'
import { Button } from '@/components/ui/button'

const SCORING_TYPES = [
  { value: 'time',        label: 'For Time' },
  { value: 'rounds_reps', label: 'AMRAP (rounds + reps)' },
  { value: 'load_kg',     label: 'Max Load (kg)' },
  { value: 'amrap',       label: 'AMRAP (total reps)' },
]

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : isEdit ? 'Update WOD' : 'Post WOD'}
    </Button>
  )
}

type Wod = { title: string; description: string; scoring_type: string } | null

export function WodForm({ date, existing }: { date: string; existing: Wod }) {
  const [state, formAction] = useFormState(saveWod, { error: null })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="date" value={date} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          name="title"
          type="text"
          required
          defaultValue={existing?.title ?? ''}
          placeholder="Fran, Murph, 21-15-9..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Scoring</label>
        <select
          name="scoringType"
          required
          defaultValue={existing?.scoring_type ?? 'time'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SCORING_TYPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          required
          rows={6}
          defaultValue={existing?.description ?? ''}
          placeholder={`21-15-9 reps for time:\nThrusters (43/30 kg)\nPull-ups`}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono resize-none"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton isEdit={!!existing} />
    </form>
  )
}
