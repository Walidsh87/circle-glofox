'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveTemplate } from '../_actions/save-template'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'

const SCORING_TYPES = [
  { value: 'time',        label: 'For Time' },
  { value: 'rounds_reps', label: 'AMRAP (rounds + reps)' },
  { value: 'load_kg',     label: 'Max Load (kg)' },
  { value: 'amrap',       label: 'AMRAP (total reps)' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--c-border-strong)',
  borderRadius: 8, background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }

export type TemplateExisting = {
  id: string; title: string; description: string; scoring_type: string
  strength_title: string | null; strength_description: string | null
  strength_lift: string | null; strength_sets: StrengthSet[] | null
} | null

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{ height: 38, padding: '0 20px', background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)' }}>
      {pending ? 'Saving…' : isEdit ? 'Update template' : 'Save template'}
    </button>
  )
}

export function TemplateForm({ existing, onSaved }: { existing: TemplateExisting; onSaved?: () => void }) {
  const [state, formAction] = useFormState(async (prev: { error: string | null }, fd: FormData) => {
    const res = await saveTemplate(prev, fd)
    if (!res.error) onSaved?.()
    return res
  }, { error: null })
  const [lift, setLift] = useState(existing?.strength_lift ?? '')
  const [sets, setSets] = useState<StrengthSet[]>(existing?.strength_sets ?? [])

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {existing && <input type="hidden" name="id" value={existing.id} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={labelStyle}>Title</label>
        <input name="title" type="text" required defaultValue={existing?.title ?? ''} placeholder="Fran, Murph…" style={inputStyle} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={labelStyle}>Scoring</label>
        <select name="scoringType" required defaultValue={existing?.scoring_type ?? 'time'} style={inputStyle}>
          {SCORING_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={labelStyle}>Description</label>
        <textarea name="description" required rows={5} defaultValue={existing?.description ?? ''} placeholder={'21-15-9 reps for time:\nThrusters\nPull-ups'} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strength (optional)</span>
        <input name="strengthTitle" type="text" defaultValue={existing?.strength_title ?? ''} placeholder="Back Squat…" style={inputStyle} />
        <textarea name="strengthDescription" rows={2} defaultValue={existing?.strength_description ?? ''} placeholder={'5x5 @ 75%'} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }} />
        <select name="strengthLift" value={lift} onChange={(e) => { setLift(e.target.value); if (!e.target.value) setSets([]) }} style={inputStyle}>
          <option value="">No % prescription</option>
          {LIFT_NAMES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        {lift && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sets.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" min={1} value={s.sets} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, sets: Number(e.target.value) } : x))} style={{ ...inputStyle, width: 64 }} aria-label="sets" />
                <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>×</span>
                <input type="number" min={1} value={s.reps} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, reps: Number(e.target.value) } : x))} style={{ ...inputStyle, width: 64 }} aria-label="reps" />
                <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>@</span>
                <input type="number" min={1} max={200} value={s.percentage} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, percentage: Number(e.target.value) } : x))} style={{ ...inputStyle, width: 72 }} aria-label="percentage" />
                <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>%</span>
                <button type="button" onClick={() => setSets((p) => p.filter((_, idx) => idx !== i))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 18 }} aria-label="remove set">×</button>
              </div>
            ))}
            <button type="button" onClick={() => setSets((p) => [...p, { sets: 5, reps: 3, percentage: 80 }])} style={{ alignSelf: 'flex-start', background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--c-ink-2)' }}>+ Add set</button>
          </div>
        )}
        <input type="hidden" name="strengthSets" value={JSON.stringify(sets)} />
      </div>

      {state.error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>}
      <div><SubmitButton isEdit={!!existing} /></div>
    </form>
  )
}
