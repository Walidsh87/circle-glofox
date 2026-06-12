'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { addLead } from '../_actions/add-lead'
import { useEffect, useRef } from 'react'

const inputClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

const SOURCES = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'walk_in',   label: 'Walk-in' },
  { value: 'referral',  label: 'Referral' },
  { value: 'other',     label: 'Other' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending} className="shrink-0">
      {pending ? 'Adding…' : 'Add lead'}
    </Button>
  )
}

export function AddLeadForm() {
  const [state, formAction] = useFormState(addLead, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2.5">
      <input name="fullName" type="text" required placeholder="Full name*" className={`${inputClass} w-40`} />
      <input name="phone" type="tel" placeholder="Phone" className={`${inputClass} w-[140px]`} />
      <input name="email" type="email" placeholder="Email" className={`${inputClass} w-[180px]`} />
      <select name="source" defaultValue="instagram" className={`${inputClass} w-[120px]`}>
        {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <input name="drop_in_date" type="date" title="Drop-in date" className={`${inputClass} w-[140px]`} />
      <input name="notes" type="text" placeholder="Notes" className={`${inputClass} w-[200px]`} />
      <SubmitButton />
      {state.error && <span role="alert" className="w-full text-xs text-danger">{state.error}</span>}
    </form>
  )
}
