'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { signWaiver } from '../_actions/sign-waiver'

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      style={{
        width: '100%',
        height: 48,
        background: pending || disabled ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 700,
        cursor: pending || disabled ? 'not-allowed' : 'pointer',
        color: pending || disabled ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        fontFamily: 'inherit',
      }}
    >
      {pending ? 'Signing…' : 'Sign Waiver & Enter Dashboard →'}
    </button>
  )
}

export function SignWaiverForm({ profileName }: { profileName: string }) {
  const [state, formAction] = useFormState(signWaiver, { error: null })
  const [agreed, setAgreed] = useState(false)
  const [typedName, setTypedName] = useState('')

  const nameMatches = typedName.trim().toLowerCase() === profileName.trim().toLowerCase()
  const canSubmit = agreed && typedName.trim().length > 0

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="agreed" value={String(agreed)} />

      {/* Checkbox */}
      <div
        onClick={() => setAgreed(!agreed)}
        style={{
          background: 'var(--c-surface)',
          border: `1px solid ${agreed ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          border: `2px solid ${agreed ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
          borderRadius: 4,
          marginTop: 1,
          flexShrink: 0,
          background: agreed ? 'var(--circle-lime)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--circle-ink)',
          fontWeight: 700,
        }}>
          {agreed ? '✓' : ''}
        </div>
        <span style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.5 }}>
          I have read, understood, and voluntarily agree to the terms of this Liability Waiver.
          I confirm I am 18 years of age or older.
        </span>
      </div>

      {/* Typed name */}
      <div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--c-ink-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Type your full legal name to sign
        </div>
        <input
          name="fullName"
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={profileName}
          style={{
            width: '100%',
            height: 44,
            padding: '0 14px',
            background: 'var(--c-surface)',
            border: `1px solid ${typedName && nameMatches ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
            borderRadius: 8,
            fontSize: 15,
            color: 'var(--circle-lime)',
            fontFamily: 'var(--font-geist-mono)',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {typedName && !nameMatches && (
          <div style={{ fontSize: 12, color: 'var(--c-danger)', marginTop: 6 }}>
            Must match your registered name: {profileName}
          </div>
        )}
      </div>

      <SubmitButton disabled={!canSubmit} />

      {state.error && (
        <div style={{ fontSize: 13, color: 'var(--c-danger)', textAlign: 'center' }}>
          {state.error}
        </div>
      )}

      <div style={{
        fontSize: 11,
        color: 'var(--c-ink-faint)',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        Signing electronically under UAE Federal Law No. 1 of 2006<br />
        Your IP address and timestamp will be recorded
      </div>
    </form>
  )
}
