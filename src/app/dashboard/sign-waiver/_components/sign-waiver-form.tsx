'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { signAgreements } from '../_actions/sign-waiver'

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
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
      {pending ? 'Signing…' : label}
    </button>
  )
}

type Props = {
  profileName: string
  waiverSigned: boolean
  termsSigned: boolean
  termsVersion: number
}

export function SignWaiverForm({ profileName, waiverSigned, termsSigned, termsVersion }: Props) {
  const [state, formAction] = useFormState(signAgreements, { error: null })
  const [waiverAgreed, setWaiverAgreed] = useState(waiverSigned)
  const [termsAgreed, setTermsAgreed] = useState(termsSigned)
  const [typedName, setTypedName] = useState('')

  const nameMatches = typedName.trim().toLowerCase() === profileName.trim().toLowerCase()
  const needsWaiver = !waiverSigned
  const needsTerms = !termsSigned
  const canSubmit =
    (waiverSigned || waiverAgreed) &&
    (termsSigned || termsAgreed) &&
    typedName.trim().length > 0 &&
    nameMatches

  const buttonLabel =
    needsWaiver && needsTerms ? 'Sign Both & Enter Dashboard →'
      : needsWaiver ? 'Sign Waiver & Enter Dashboard →'
      : 'Sign Terms & Enter Dashboard →'

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="waiverAgreed" value={String(waiverAgreed)} />
      <input type="hidden" name="termsAgreed" value={String(termsAgreed)} />
      <input type="hidden" name="termsVersion" value={String(termsVersion)} />

      {needsWaiver && (
        <ConsentBox
          checked={waiverAgreed}
          onToggle={() => setWaiverAgreed(!waiverAgreed)}
          label="I have read and agree to the Liability Waiver. I am 18 years of age or older."
        />
      )}

      {needsTerms && (
        <ConsentBox
          checked={termsAgreed}
          onToggle={() => setTermsAgreed(!termsAgreed)}
          label="I have read and agree to the Membership Terms & Conditions, including the billing, cancellation, and refund policies."
        />
      )}

      <div style={{ marginTop: 4 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--c-ink-muted)',
          letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
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
            width: '100%', height: 44, padding: '0 14px',
            background: 'var(--c-surface)',
            border: `1px solid ${typedName && nameMatches ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
            borderRadius: 8, fontSize: 15, color: 'var(--circle-lime)',
            fontFamily: 'var(--font-geist-mono)', boxSizing: 'border-box', outline: 'none',
          }}
        />
        {typedName && !nameMatches && (
          <div style={{ fontSize: 12, color: 'var(--c-danger)', marginTop: 6 }}>
            Must match your registered name: {profileName}
          </div>
        )}
      </div>

      <SubmitButton disabled={!canSubmit} label={buttonLabel} />

      {state.error && (
        <div style={{ fontSize: 13, color: 'var(--c-danger)', textAlign: 'center' }}>
          {state.error}
        </div>
      )}

      <div style={{
        fontSize: 11, color: 'var(--c-ink-faint)',
        textAlign: 'center', lineHeight: 1.6,
      }}>
        Signing electronically under UAE Federal Law No. 1 of 2006<br />
        Your IP address and timestamp will be recorded
      </div>
    </form>
  )
}

function ConsentBox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <div
      onClick={onToggle}
      style={{
        background: 'var(--c-surface)',
        border: `1px solid ${checked ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
        borderRadius: 8, padding: '14px 16px',
        display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
      }}
    >
      <div style={{
        width: 18, height: 18,
        border: `2px solid ${checked ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
        borderRadius: 4, marginTop: 1, flexShrink: 0,
        background: checked ? 'var(--circle-lime)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'var(--circle-ink)', fontWeight: 700,
      }}>
        {checked ? '✓' : ''}
      </div>
      <span style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.5 }}>
        {label}
      </span>
    </div>
  )
}
