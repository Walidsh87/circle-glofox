'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { addMember } from '../_actions/add-member'
import { Button } from '@/components/ui/button'
import { useEffect, useRef } from 'react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Adding...' : 'Add member'}
    </Button>
  )
}

export function AddMemberForm() {
  const [state, formAction] = useFormState(addMember, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) {
      formRef.current.reset()
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <input
        name="fullName"
        type="text"
        required
        placeholder="Full name"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        name="phone"
        type="tel"
        placeholder="Phone (optional)"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <select
        name="role"
        required
        defaultValue="athlete"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="athlete">Athlete</option>
        <option value="coach">Coach</option>
      </select>
      <div className="sm:col-span-4 flex items-center gap-3">
        <SubmitButton />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  )
}
