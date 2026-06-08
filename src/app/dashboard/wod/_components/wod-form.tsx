'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveWod } from '../_actions/save-wod'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet, ScalingTier } from '../_lib/validation'

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
  strength_lift?: string | null
  strength_sets?: StrengthSet[] | null
  scaling?: ScalingTier[] | null
} | null

export function WodForm({ date, existing }: { date: string; existing: Wod }) {
  const [state, formAction] = useFormState(saveWod, { error: null })
  const [lift, setLift] = useState(existing?.strength_lift ?? '')
  const [sets, setSets] = useState<StrengthSet[]>(existing?.strength_sets ?? [])

  function updateSet(i: number, key: keyof StrengthSet, value: number) {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)))
  }
  function addSet() {
    setSets((prev) => [...prev, { sets: 5, reps: 3, percentage: 80 }])
  }
  function removeSet(i: number) {
    setSets((prev) => prev.filter((_, idx) => idx !== i))
  }

  const [scaling, setScaling] = useState<ScalingTier[]>(existing?.scaling ?? [])
  function updateTier(i: number, key: keyof ScalingTier, value: string) {
    setScaling((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)))
  }
  function addTier() {
    const SUGGESTED = ['Rx', 'Scaled', 'Beginner']
    setScaling((prev) => [...prev, { label: SUGGESTED[prev.length] ?? '', description: '' }])
  }
  function removeTier(i: number) {
    setScaling((prev) => prev.filter((_, idx) => idx !== i))
  }

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

        {/* The Wedge — structured % prescription */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
          <label className="mono" style={labelStyle}>% Loading (optional · powers per-athlete loads)</label>
          <select
            name="strengthLift"
            value={lift}
            onChange={(e) => setLift(e.target.value)}
            style={inputStyle}
          >
            <option value="">No % prescription</option>
            {LIFT_NAMES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          {lift && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sets.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" min={1} value={s.sets}
                    onChange={(e) => updateSet(i, 'sets', Number(e.target.value))}
                    style={{ ...inputStyle, width: 64 }} aria-label="sets" />
                  <span className="mono" style={{ color: 'var(--c-ink-muted)', fontSize: 13 }}>×</span>
                  <input type="number" min={1} value={s.reps}
                    onChange={(e) => updateSet(i, 'reps', Number(e.target.value))}
                    style={{ ...inputStyle, width: 64 }} aria-label="reps" />
                  <span className="mono" style={{ color: 'var(--c-ink-muted)', fontSize: 13 }}>@</span>
                  <input type="number" min={1} max={200} value={s.percentage}
                    onChange={(e) => updateSet(i, 'percentage', Number(e.target.value))}
                    style={{ ...inputStyle, width: 72 }} aria-label="percentage" />
                  <span className="mono" style={{ color: 'var(--c-ink-muted)', fontSize: 13 }}>%</span>
                  <button type="button" onClick={() => removeSet(i)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                    aria-label="remove set">×</button>
                </div>
              ))}
              <button type="button" onClick={addSet}
                style={{ alignSelf: 'flex-start', background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--c-ink-2)' }}>
                + Add set
              </button>
            </div>
          )}
          <input type="hidden" name="strengthSets" value={JSON.stringify(sets)} />
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

      {/* Scaling section */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Scaling options (optional)
        </span>
        {scaling.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: i > 0 ? '1px solid var(--c-border)' : 'none', paddingTop: i > 0 ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="text" value={t.label} onChange={(e) => updateTier(i, 'label', e.target.value)} placeholder="Rx" style={{ ...inputStyle, width: 160 }} aria-label="tier label" />
              <button type="button" onClick={() => removeTier(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="remove tier">×</button>
            </div>
            <textarea value={t.description} onChange={(e) => updateTier(i, 'description', e.target.value)} rows={2} placeholder="42.5/30kg thrusters, pull-ups" style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }} aria-label="tier description" />
          </div>
        ))}
        <button type="button" onClick={addTier} style={{ alignSelf: 'flex-start', background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--c-ink-2)' }}>
          + Add scaling tier
        </button>
        <input type="hidden" name="scaling" value={JSON.stringify(scaling)} />
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
