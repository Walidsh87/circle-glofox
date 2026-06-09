'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { updateMember } from '../_actions/update-member'
import { BLOOD_TYPES } from '../_lib/member-fields-validation'

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 12px',
  border: '1px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none',
}

function SaveButton() {
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
        fontFamily: 'inherit',
      }}
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  )
}

type Props = {
  memberId: string
  fullName: string
  phone: string | null
  role: string
  viewerRole: string
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
  dateOfBirth: string | null
}

export function EditMemberForm({ memberId, fullName, phone, role, viewerRole, emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth }: Props) {
  const [editing, setEditing] = useState(false)
  const [state, formAction] = useFormState(async (prev: { error: string | null }, fd: FormData) => {
    const result = await updateMember(prev, fd)
    if (!result.error) setEditing(false)
    return result
  }, { error: null })

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          height: 32, padding: '0 14px',
          background: 'transparent', border: '1px solid var(--c-border)',
          borderRadius: 8, cursor: 'pointer', fontSize: 13,
          color: 'var(--c-ink-2)', fontFamily: 'inherit',
        }}
      >
        Edit
      </button>
    )
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <input type="hidden" name="memberId" value={memberId} />
      <input
        name="fullName"
        type="text"
        required
        defaultValue={fullName}
        placeholder="Full name"
        style={{ ...inputStyle, width: 180 }}
      />
      <input
        name="phone"
        type="tel"
        defaultValue={phone ?? ''}
        placeholder="Phone"
        style={{ ...inputStyle, width: 140 }}
      />
      {viewerRole === 'owner' && (
        <select name="role" defaultValue={role} style={{ ...inputStyle, width: 110 }}>
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
        </select>
      )}
      <input name="emergencyContactName" type="text" defaultValue={emergencyContactName ?? ''} placeholder="Emergency contact" style={{ ...inputStyle, width: 160 }} />
      <input name="emergencyContactPhone" type="tel" defaultValue={emergencyContactPhone ?? ''} placeholder="Emergency phone" style={{ ...inputStyle, width: 150 }} />
      <select name="bloodType" defaultValue={bloodType ?? ''} style={{ ...inputStyle, width: 96 }}>
        <option value="">Blood —</option>
        {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <input name="dateOfBirth" type="date" defaultValue={dateOfBirth ?? ''} style={{ ...inputStyle, width: 150 }} />
      <textarea name="allergies" defaultValue={allergies ?? ''} placeholder="Allergies / medical notes" rows={2} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', width: '100%', resize: 'vertical' }} />
      <SaveButton />
      <button
        type="button"
        onClick={() => setEditing(false)}
        style={{
          height: 36, padding: '0 12px',
          background: 'transparent', border: '1px solid var(--c-border)',
          borderRadius: 8, cursor: 'pointer', fontSize: 13,
          color: 'var(--c-ink-muted)', fontFamily: 'inherit',
        }}
      >
        Cancel
      </button>
      {state.error && <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</span>}
    </form>
  )
}
