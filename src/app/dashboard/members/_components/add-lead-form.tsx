'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { addLead } from '../_actions/add-lead'
import { useEffect, useRef } from 'react'

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 12px',
  border: '1px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none',
}

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
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 36, padding: '0 16px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {pending ? 'Adding…' : 'Add lead'}
    </button>
  )
}

export function AddLeadForm() {
  const [state, formAction] = useFormState(addLead, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <input name="fullName" type="text" required placeholder="Full name*" style={{ ...inputStyle, width: 160 }} />
      <input name="phone" type="tel" placeholder="Phone" style={{ ...inputStyle, width: 140 }} />
      <input name="email" type="email" placeholder="Email" style={{ ...inputStyle, width: 180 }} />
      <select name="source" defaultValue="instagram" style={{ ...inputStyle, width: 120 }}>
        {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <input name="drop_in_date" type="date" title="Drop-in date" style={{ ...inputStyle, width: 140 }} />
      <input name="notes" type="text" placeholder="Notes" style={{ ...inputStyle, width: 200 }} />
      <SubmitButton />
      {state.error && <span style={{ width: '100%', fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</span>}
    </form>
  )
}
