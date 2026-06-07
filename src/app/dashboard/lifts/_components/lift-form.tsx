'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveLift, type PrInfo } from '../_actions/save-lift'
import { useEffect, useRef } from 'react'
import { LIFT_NAMES } from '../_lib/lift-names'

function prLabel(pr: PrInfo): string {
  return LIFT_NAMES.find((l) => l.value === pr.liftName)?.label ?? pr.liftName
}

const inputStyle: React.CSSProperties = {
  height: 38, padding: '0 12px',
  border: '1px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none',
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 38, padding: '0 18px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 8,
        fontSize: 13.5, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        letterSpacing: '0.01em',
        transition: 'opacity 120ms',
      }}
    >
      {pending ? 'Saving…' : 'Save 1RM'}
    </button>
  )
}

type Lift = { lift_name: string; one_rm_grams: number }

export function LiftForm({ lifts }: { lifts: Lift[] }) {
  const [state, formAction] = useFormState(saveLift, { error: null, pr: null })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.error && formRef.current) formRef.current.reset()
  }, [state])

  const liftMap = Object.fromEntries(lifts.map((l) => [l.lift_name, l.one_rm_grams / 1000]))

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Lift
        </label>
        <select name="liftName" required style={{ ...inputStyle, minWidth: 200, paddingRight: 8 }}>
          <option value="">Select lift</option>
          {LIFT_NAMES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}{liftMap[l.value] ? ` (current: ${liftMap[l.value]}kg)` : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          1RM (kg)
        </label>
        <input
          name="weightKg"
          type="number"
          min={1} max={500} step={0.5}
          required
          placeholder="e.g. 100"
          style={{ ...inputStyle, width: 110 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SubmitButton />
        {state.error && (
          <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</span>
        )}
        {state.pr && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>
            🏆 {prLabel(state.pr)} PR! {state.pr.newKg}kg — +{state.pr.deltaKg}kg over your previous best
          </span>
        )}
      </div>
    </form>
  )
}
