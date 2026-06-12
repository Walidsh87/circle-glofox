'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { editMembershipPlan } from '../_actions/edit-membership-plan'
import { toggleMembershipPlan } from '../_actions/toggle-membership-plan'
import { deleteMembershipPlan } from '../_actions/delete-membership-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null; active: boolean; is_trial: boolean; trial_days: number | null }

const cellClass = 'px-3.5 py-2.5 text-[13px] text-ink-2'
const btnClass =
  'rounded-md border border-line bg-transparent px-2 py-1 text-xs text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const inputClass =
  'rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function MembershipPlanRow({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(plan.name)
  const [price, setPrice] = useState(plan.monthly_price_aed?.toString() ?? '')
  const [planRef, setPlanRef] = useState(plan.provider_plan_ref ?? '')
  const [isTrial, setIsTrial] = useState(plan.is_trial)
  const [trialDays, setTrialDays] = useState(plan.trial_days?.toString() ?? '')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error); else setEditing(false) })

  if (editing) {
    return (
      <tr className="border-b border-line">
        <td className={cellClass}><input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-[150px]`} /></td>
        <td className={cellClass}><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} step="0.01" className={`${inputClass} w-[100px]`} /></td>
        <td className={cellClass}><input value={planRef} onChange={(e) => setPlanRef(e.target.value)} placeholder="Stripe ID" className={`${inputClass} w-[150px]`} /></td>
        <td className={cellClass}>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} className="accent-[var(--accent)]" /> Trial
            {isTrial && <input value={trialDays} onChange={(e) => setTrialDays(e.target.value)} type="number" min={1} placeholder="days" className={`${inputClass} w-[60px]`} />}
          </label>
        </td>
        <td className={cn(cellClass, 'text-right')}>
          <div className="flex justify-end gap-1.5">
            <button className={btnClass} disabled={pending} onClick={() => run(() => editMembershipPlan(plan.id, name, price.trim() ? parseFloat(price) : null, planRef.trim() || null, isTrial, isTrial && trialDays.trim() ? parseInt(trialDays) : null))}>Save</button>
            <button className={btnClass} disabled={pending} onClick={() => { setEditing(false); setName(plan.name); setPrice(plan.monthly_price_aed?.toString() ?? ''); setPlanRef(plan.provider_plan_ref ?? ''); setIsTrial(plan.is_trial); setTrialDays(plan.trial_days?.toString() ?? '') }}>Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={cn('border-b border-line', !plan.active && 'opacity-50')}>
      <td className={cn(cellClass, 'font-semibold text-ink')}>
        {plan.name}
        {plan.is_trial && <span className="ml-2 font-mono text-[10px] font-bold text-accent-ink">TRIAL · {plan.trial_days}d</span>}
      </td>
      <td className={cellClass}>{plan.monthly_price_aed != null ? `${plan.monthly_price_aed} AED` : '—'}</td>
      <td className={cn(cellClass, 'font-mono text-xs')}>{plan.provider_plan_ref ?? '—'}</td>
      <td className={cellClass}>
        <Badge tone={plan.active ? 'ok' : 'neutral'}>{plan.active ? 'Active' : 'Inactive'}</Badge>
      </td>
      <td className={cn(cellClass, 'text-right')}>
        <div className="flex justify-end gap-1.5">
          <button className={btnClass} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
          <button className={btnClass} disabled={pending} onClick={() => run(() => toggleMembershipPlan(plan.id, !plan.active))}>{plan.active ? 'Deactivate' : 'Activate'}</button>
          <button className={cn(btnClass, 'text-danger hover:border-danger hover:text-danger')} disabled={pending} onClick={() => { if (confirm('Delete this plan?')) run(() => deleteMembershipPlan(plan.id)) }}>Delete</button>
        </div>
      </td>
    </tr>
  )
}
