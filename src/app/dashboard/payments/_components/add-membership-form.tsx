'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveMembership } from '../_actions/save-membership'
import { Button } from '@/components/ui/button'
import { useEffect, useRef } from 'react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'Adding...' : 'Add membership'}</Button>
}

type Athlete = { id: string; full_name: string }

export function AddMembershipForm({ athletes }: { athletes: Athlete[] }) {
  const [state, formAction] = useFormState(saveMembership, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <select name="athleteId" required
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        <option value="">Select athlete</option>
        {athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
      </select>
      <input name="planName" type="text" required placeholder="Plan (e.g. Unlimited)"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      <input name="monthlyPrice" type="number" min={0} step={0.01} placeholder="Price (AED)"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      <input name="startDate" type="date" required defaultValue={today}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
        <SubmitButton />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  )
}
