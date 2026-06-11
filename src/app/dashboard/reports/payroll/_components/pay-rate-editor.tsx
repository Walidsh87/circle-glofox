'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePayRate } from '../_actions/save-pay-rate'

const field: React.CSSProperties = { height: 30, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 12.5, color: 'var(--c-ink)', padding: '0 8px', boxSizing: 'border-box' }

export function PayRateEditor({ coachId, baseType, baseRate, ptRate }: {
  coachId: string
  baseType: string | null
  baseRate: number | null
  ptRate: number | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [bt, setBt] = useState(baseType ?? '')
  const [br, setBr] = useState(baseRate?.toString() ?? '')
  const [pr, setPr] = useState(ptRate?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSave() {
    setError(null)
    start(async () => {
      const res = await savePayRate(
        coachId,
        bt === '' ? null : bt,
        br.trim() === '' ? null : Number(br),
        pr.trim() === '' ? null : Number(pr),
      )
      if (res.error) setError(res.error)
      else { setEditing(false); router.refresh() }
    })
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        Edit rates
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={bt} onChange={(e) => setBt(e.target.value)} style={field} aria-label="Base pay type">
          <option value="">No base</option>
          <option value="per_class">Per class</option>
          <option value="monthly">Monthly</option>
        </select>
        <input type="number" min={0} step="0.01" placeholder="Base AED" value={br} onChange={(e) => setBr(e.target.value)} style={{ ...field, width: 90 }} aria-label="Base rate (AED)" />
        <input type="number" min={0} step="0.01" placeholder="PT AED" value={pr} onChange={(e) => setPr(e.target.value)} style={{ ...field, width: 80 }} aria-label="PT rate (AED)" />
        <button onClick={onSave} disabled={pending} style={{ height: 30, padding: '0 12px', borderRadius: 6, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{pending ? '…' : 'Save'}</button>
        <button onClick={() => { setEditing(false); setError(null) }} disabled={pending} style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-2)' }}>Cancel</button>
      </div>
      {error && <p style={{ fontSize: 11.5, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
    </div>
  )
}
