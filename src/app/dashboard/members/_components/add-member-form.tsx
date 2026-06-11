'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { addMember } from '../_actions/add-member'
import { useEffect, useRef } from 'react'

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 12px',
  border: '1px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none',
}

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
      {pending ? 'Adding…' : 'Add member'}
    </button>
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
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <input name="fullName" type="text" required placeholder="Full name" style={{ ...inputStyle, width: 180 }} />
      <input name="email" type="email" required placeholder="Email" style={{ ...inputStyle, width: 200 }} />
      <input name="phone" type="tel" placeholder="Phone (optional)" style={{ ...inputStyle, width: 160 }} />
      <select name="role" required defaultValue={roles[0].value} style={{ ...inputStyle, width: 130 }}>
        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <SubmitButton />
      {state.error && <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</span>}
    </form>
  )
}
