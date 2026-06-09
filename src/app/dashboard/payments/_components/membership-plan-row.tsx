'use client'

import { useState, useTransition } from 'react'
import { editMembershipPlan } from '../_actions/edit-membership-plan'
import { toggleMembershipPlan } from '../_actions/toggle-membership-plan'
import { deleteMembershipPlan } from '../_actions/delete-membership-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null; active: boolean }

const cell: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: 'var(--c-ink-2)' }
const btn: React.CSSProperties = { background: 'none', border: '1px solid var(--c-border)', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-2)' }
const input: React.CSSProperties = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13 }

export function MembershipPlanRow({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(plan.name)
  const [price, setPrice] = useState(plan.monthly_price_aed?.toString() ?? '')
  const [planRef, setPlanRef] = useState(plan.provider_plan_ref ?? '')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error); else setEditing(false) })

  if (editing) {
    return (
      <tr style={{ borderBottom: '1px solid var(--c-divider)' }}>
        <td style={cell}><input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 150 }} /></td>
        <td style={cell}><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} step="0.01" style={{ ...input, width: 100 }} /></td>
        <td style={cell}><input value={planRef} onChange={(e) => setPlanRef(e.target.value)} placeholder="Stripe ID" style={{ ...input, width: 150 }} /></td>
        <td style={cell} />
        <td style={{ ...cell, textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button style={btn} disabled={pending} onClick={() => run(() => editMembershipPlan(plan.id, name, price.trim() ? parseFloat(price) : null, planRef.trim() || null))}>Save</button>
            <button style={btn} disabled={pending} onClick={() => { setEditing(false); setName(plan.name); setPrice(plan.monthly_price_aed?.toString() ?? ''); setPlanRef(plan.provider_plan_ref ?? '') }}>Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--c-divider)', opacity: plan.active ? 1 : 0.5 }}>
      <td style={{ ...cell, fontWeight: 600, color: 'var(--c-ink)' }}>{plan.name}</td>
      <td style={cell}>{plan.monthly_price_aed != null ? `${plan.monthly_price_aed} AED` : '—'}</td>
      <td style={{ ...cell, fontFamily: 'var(--font-geist-mono, monospace)', fontSize: 12 }}>{plan.provider_plan_ref ?? '—'}</td>
      <td style={cell}>
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: plan.active ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)', color: plan.active ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)' }}>
          {plan.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style={{ ...cell, textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button style={btn} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
          <button style={btn} disabled={pending} onClick={() => run(() => toggleMembershipPlan(plan.id, !plan.active))}>{plan.active ? 'Deactivate' : 'Activate'}</button>
          <button style={{ ...btn, color: 'var(--c-danger-ink)' }} disabled={pending} onClick={() => { if (confirm('Delete this plan?')) run(() => deleteMembershipPlan(plan.id)) }}>Delete</button>
        </div>
      </td>
    </tr>
  )
}
