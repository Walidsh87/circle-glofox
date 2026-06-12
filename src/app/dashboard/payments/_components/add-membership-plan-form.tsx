'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createMembershipPlan } from '../_actions/create-membership-plan'

const inputClass =
  'rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Add plan'}
    </Button>
  )
}

export function AddMembershipPlanForm() {
  const [state, formAction] = useFormState(createMembershipPlan, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  const [isTrial, setIsTrial] = useState(false)
  useEffect(() => { if (!state.error && formRef.current) { formRef.current.reset(); setIsTrial(false) } }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="name" placeholder="Plan name (e.g. Unlimited)" className={`${inputClass} w-[200px]`} />
      <input name="monthlyPrice" type="number" min={0} step="0.01" placeholder="Monthly price (AED)" className={`${inputClass} w-40`} />
      <input name="providerPlanRef" placeholder="Stripe Price ID (optional)" className={`${inputClass} w-[200px] font-mono`} />
      <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
        <input type="checkbox" name="isTrial" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} className="accent-[var(--accent)]" /> Trial
      </label>
      {isTrial && <input name="trialDays" type="number" min={1} placeholder="Trial days" className={`${inputClass} w-[110px]`} />}
      <SubmitButton />
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
    </form>
  )
}
