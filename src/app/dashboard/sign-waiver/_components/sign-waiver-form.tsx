'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { signAgreements } from '../_actions/sign-waiver'

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        'h-12 w-full rounded-lg text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        pending || disabled
          ? 'cursor-not-allowed bg-surface-2 text-ink-3'
          : 'bg-accent text-accent-contrast hover:bg-accent-hover'
      )}
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
  parqDue: boolean
  parqQuestions: string[]
}

export function SignWaiverForm({ profileName, waiverSigned, termsSigned, termsVersion, parqDue, parqQuestions }: Props) {
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
      : needsTerms ? 'Sign Terms & Enter Dashboard →'
      : 'Submit PAR-Q & Enter Dashboard →'

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="waiverAgreed" value={String(waiverAgreed)} />
      <input type="hidden" name="termsAgreed" value={String(termsAgreed)} />
      <input type="hidden" name="termsVersion" value={String(termsVersion)} />

      {parqDue && (
        <div className="rounded-lg border border-line-strong bg-surface px-4 py-3.5">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Physical Activity Readiness Questionnaire (PAR-Q)
          </div>
          <p className="mb-1 text-xs leading-normal text-ink-3">
            Answer honestly — a YES does not block your access; the team will follow up with you.
          </p>
          {parqQuestions.map((q, i) => (
            <div key={i} className={cn('py-2.5', i > 0 && 'border-t border-line')}>
              <div className="mb-2 text-[13px] leading-normal text-ink-2">{q}</div>
              <div className="flex gap-[18px]">
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
                  <input type="radio" name={`parq_${i}`} value="yes" className="accent-accent" /> Yes
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
                  <input type="radio" name={`parq_${i}`} value="no" className="accent-accent" /> No
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

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

      <div className="mt-1">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Type your full legal name to sign
        </div>
        <input
          name="fullName"
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={profileName}
          className={cn(
            'h-11 w-full rounded-lg border bg-surface px-3.5 font-mono text-[15px] text-accent-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent',
            typedName && nameMatches ? 'border-accent' : 'border-line-strong'
          )}
        />
        {typedName && !nameMatches && (
          <div className="mt-1.5 text-xs text-danger">
            Must match your registered name: {profileName}
          </div>
        )}
      </div>

      <SubmitButton disabled={!canSubmit} label={buttonLabel} />

      {state.error && (
        <div className="text-center text-[13px] text-danger">
          {state.error}
        </div>
      )}

      <div className="text-center text-[11px] leading-relaxed text-ink-faint">
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
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3.5',
        checked ? 'border-accent' : 'border-line-strong'
      )}
    >
      <div className={cn(
        'mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 text-[11px] font-bold',
        checked ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong bg-transparent'
      )}>
        {checked ? '✓' : ''}
      </div>
      <span className="text-[13px] leading-normal text-ink-2">
        {label}
      </span>
    </div>
  )
}
