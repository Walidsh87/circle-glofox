'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createStripePlan } from '../_actions/create-stripe-plan'

function SubmitBtn() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 38, padding: '0 18px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 8,
        fontSize: 13, fontWeight: 700,
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        cursor: pending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      }}
    >
      {pending ? 'Creating…' : 'Create plan'}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  height: 38, padding: '0 12px',
  border: '1.5px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export function CreateStripePlanForm() {
  const [state, formAction] = useFormState(createStripePlan, { error: null, priceId: null })

  return (
    <div>
      {state.priceId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--c-ok-ink)', fontWeight: 600 }}>Plan created.</span>
          <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Stripe Price ID:</span>
          <code style={{
            fontFamily: 'var(--font-geist-mono)', fontSize: 12,
            background: 'var(--c-surface-sunk)', padding: '2px 8px', borderRadius: 6,
            color: 'var(--c-ink)', border: '1px solid var(--c-border)',
            userSelect: 'all',
          }}>{state.priceId}</code>
          <span style={{ fontSize: 12, color: 'var(--c-ink-faint)' }}>— paste this into the membership form below</span>
        </div>
      ) : (
        <form action={formAction} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="planName" className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Plan name</label>
            <input id="planName" name="planName" type="text" required placeholder="e.g. Unlimited" style={{ ...inputStyle, width: 180 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="priceAed" className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monthly (AED)</label>
            <input id="priceAed" name="priceAed" type="number" required min="1" placeholder="1500" style={{ ...inputStyle, width: 120 }} />
          </div>
          <SubmitBtn />
          {state.error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0, width: '100%' }}>{state.error}</p>}
        </form>
      )}
    </div>
  )
}
