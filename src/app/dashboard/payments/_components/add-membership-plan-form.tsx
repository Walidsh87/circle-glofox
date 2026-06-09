'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { createMembershipPlan } from '../_actions/create-membership-plan'

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c-border)',
  background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13,
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{
      padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 600, opacity: pending ? 0.6 : 1,
    }}>{pending ? 'Saving…' : 'Add plan'}</button>
  )
}

export function AddMembershipPlanForm() {
  const [state, formAction] = useFormState(createMembershipPlan, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  const [isTrial, setIsTrial] = useState(false)
  useEffect(() => { if (!state.error && formRef.current) { formRef.current.reset(); setIsTrial(false) } }, [state])

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input name="name" placeholder="Plan name (e.g. Unlimited)" style={{ ...inputStyle, width: 200 }} />
      <input name="monthlyPrice" type="number" min={0} step="0.01" placeholder="Monthly price (AED)" style={{ ...inputStyle, width: 160 }} />
      <input name="providerPlanRef" placeholder="Stripe Price ID (optional)" style={{ ...inputStyle, width: 200, fontFamily: 'var(--font-geist-mono, monospace)' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--c-ink-2)' }}>
        <input type="checkbox" name="isTrial" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} /> Trial
      </label>
      {isTrial && <input name="trialDays" type="number" min={1} placeholder="Trial days" style={{ ...inputStyle, width: 110 }} />}
      <SubmitButton />
      {state.error && <span style={{ color: 'var(--c-danger-ink)', fontSize: 12 }}>{state.error}</span>}
    </form>
  )
}
