'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveWod } from '../_actions/save-wod'

const SCORING_TYPES = [
  { value: 'time',        label: 'For Time' },
  { value: 'rounds_reps', label: 'AMRAP (rounds + reps)' },
  { value: 'load_kg',     label: 'Max Load (kg)' },
  { value: 'amrap',       label: 'AMRAP (total reps)' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px',
  border: '1px solid var(--c-border-strong)', borderRadius: 8,
  background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--c-ink-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 38, padding: '0 20px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 8,
        fontSize: 13.5, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        transition: 'opacity 120ms',
      }}
    >
      {pending ? 'Saving…' : isEdit ? 'Update WOD' : 'Post WOD'}
    </button>
  )
}

type Wod = {
  title: string
  description: string
  scoring_type: string
  strength_title?: string | null
  strength_description?: string | null
} | null

export function WodForm({ date, existing }: { date: string; existing: Wod }) {
  const [state, formAction] = useFormState(saveWod, { error: null })

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="date" value={date} />

      {/* Strength section */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Strength (optional)
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="mono" style={labelStyle}>Movement</label>
          <input
            name="strengthTitle"
            type="text"
            defaultValue={existing?.strength_title ?? ''}
            placeholder="Back Squat, Deadlift, Clean & Jerk…"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="mono" style={labelStyle}>Program</label>
          <textarea
            name="strengthDescription"
            rows={3}
            defaultValue={existing?.strength_description ?? ''}
            placeholder={'5x5 @ 75%\nRest 2 min between sets'}
            style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }}
          />
        </div>
      </div>

      {/* WOD section */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          WOD
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="mono" style={labelStyle}>Title</label>
          <input
            name="title"
            type="text"
            required
            defaultValue={existing?.title ?? ''}
            placeholder="Fran, Murph, 21-15-9…"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="mono" style={labelStyle}>Scoring</label>
          <select
            name="scoringType"
            required
            defaultValue={existing?.scoring_type ?? 'time'}
            style={inputStyle}
          >
            {SCORING_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="mono" style={labelStyle}>Description</label>
          <textarea
            name="description"
            required
            rows={6}
            defaultValue={existing?.description ?? ''}
            placeholder={'21-15-9 reps for time:\nThrusters (43/30 kg)\nPull-ups'}
            style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }}
          />
        </div>
      </div>

      {state.error && (
        <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>
      )}
      <div>
        <SubmitButton isEdit={!!existing} />
      </div>
    </form>
  )
}
