'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { addMember } from '../_actions/add-member'
import { useEffect, useRef } from 'react'

const inputClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending} className="shrink-0">
      {pending ? 'Adding…' : 'Add member'}
    </Button>
  )
}

export function AddMemberForm({ roles = [{ value: 'athlete', label: 'Athlete' }] }: { roles?: { value: string; label: string }[] }) {
  const [state, formAction] = useFormState(addMember, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) {
      formRef.current.reset()
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2.5">
      <input name="fullName" type="text" required placeholder="Full name" className={`${inputClass} w-[180px]`} />
      <input name="email" type="email" required placeholder="Email" className={`${inputClass} w-[200px]`} />
      <input name="phone" type="tel" placeholder="Phone (optional)" className={`${inputClass} w-40`} />
      <select name="role" required defaultValue={roles[0].value} className={`${inputClass} w-[130px]`}>
        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <SubmitButton />
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
    </form>
  )
}
