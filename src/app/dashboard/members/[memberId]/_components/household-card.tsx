'use client'

import { useState, useTransition } from 'react'
import { createHousehold, addToHousehold, removeFromHousehold } from '../_actions/household'

type HH = { id: string; name: string; primaryAthleteId: string }
type Person = { id: string; full_name: string }

const inp: React.CSSProperties = { height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }
const btn: React.CSSProperties = { height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-ink-2)' }

export function HouseholdCard({ memberId, household, members, allHouseholds }: {
  memberId: string
  household: HH | null
  members: Person[]
  allHouseholds: { id: string; name: string }[]
}) {
  const [name, setName] = useState('')
  const [pick, setPick] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })

  if (household) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{household.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map((p) => (
            <div key={p.id} style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>
              {p.full_name}
              {p.id === household.primaryAthleteId && <span className="mono" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>PAYER</span>}
            </div>
          ))}
        </div>
        {memberId !== household.primaryAthleteId && (
          <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Covered by the household payer’s membership.</div>
        )}
        <button style={ghost} disabled={pending} onClick={() => run(() => removeFromHousehold(memberId))}>Remove from household</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New household name" style={{ ...inp, width: 180 }} />
        <button style={btn} disabled={pending || !name.trim()} onClick={() => run(() => createHousehold(memberId, name))}>Create (this member is payer)</button>
      </div>
      {allHouseholds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={inp}>
            <option value="">Add to existing…</option>
            {allHouseholds.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button style={ghost} disabled={pending || !pick} onClick={() => run(() => addToHousehold(pick, memberId))}>Add</button>
        </div>
      )}
    </div>
  )
}
