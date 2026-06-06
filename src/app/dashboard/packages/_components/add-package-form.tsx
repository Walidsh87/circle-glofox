'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { createPackage } from '../_actions/create-package'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--c-border)', background: 'var(--c-surface)',
  color: 'var(--c-ink)', fontSize: 13,
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{
      padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: 'var(--circle-lime)', color: 'var(--circle-ink)',
      fontSize: 13, fontWeight: 600, opacity: pending ? 0.6 : 1,
    }}>{pending ? 'Saving…' : 'Add package'}</button>
  )
}

export function AddPackageForm() {
  const [state, formAction] = useFormState(createPackage, { error: null })
  const [type, setType] = useState('class_pack')

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input name="name" placeholder="Package name (e.g. 10-Class Pack)" style={inputStyle} />
      <select name="type" value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
        <option value="class_pack">Class pack</option>
        <option value="drop_in">Drop-in pass</option>
        <option value="pt_block">PT block</option>
      </select>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          key={type}
          name="creditCount"
          type="number"
          min={1}
          placeholder={type === 'drop_in' ? '1 (fixed)' : 'Credits'}
          disabled={type === 'drop_in'}
          defaultValue={type === 'drop_in' ? 1 : undefined}
          style={inputStyle}
        />
        <input name="priceAed" type="number" min={0} step="0.01" placeholder="Price (AED)" style={inputStyle} />
        <input name="expiryDays" type="number" min={1} placeholder="Expiry days (optional)" style={inputStyle} />
      </div>
      {state.error && <p style={{ color: 'var(--c-danger-ink)', fontSize: 12 }}>{state.error}</p>}
      <SubmitButton />
    </form>
  )
}
