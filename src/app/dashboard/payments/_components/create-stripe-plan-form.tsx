'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { createStripePlan } from '../_actions/create-stripe-plan'

const inputClass =
  'h-10 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const labelClass = 'font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create plan'}
    </Button>
  )
}

export function CreateStripePlanForm() {
  const [state, formAction] = useFormState(createStripePlan, { error: null, priceId: null })

  return (
    <div>
      {state.priceId ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] font-semibold text-ok">Plan created.</span>
          <span className="text-xs text-ink-3">Stripe Price ID:</span>
          <code className="select-all rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink">
            {state.priceId}
          </code>
          <span className="text-xs text-ink-faint">— paste this into the membership form below</span>
        </div>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-2.5">
          <div className="flex flex-col gap-1">
            <label htmlFor="planName" className={labelClass}>Plan name</label>
            <input id="planName" name="planName" type="text" required placeholder="e.g. Unlimited" className={`${inputClass} w-[180px]`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="priceAed" className={labelClass}>Monthly (AED)</label>
            <input id="priceAed" name="priceAed" type="number" required min="1" placeholder="1500" className={`${inputClass} w-[120px]`} />
          </div>
          <SubmitBtn />
          {state.error && <p role="alert" className="m-0 w-full text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  )
}
