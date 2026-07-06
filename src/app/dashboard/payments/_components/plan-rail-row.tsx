'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { editMembershipPlan } from '../_actions/edit-membership-plan'
import { toggleMembershipPlan } from '../_actions/toggle-membership-plan'
import { deleteMembershipPlan } from '../_actions/delete-membership-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null; active: boolean; is_trial: boolean; trial_days: number | null }

const inputClass =
  'w-full rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const miniBtn =
  'text-[11px] font-medium text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

/** Compact membership-plan row for the Payments right rail — same actions as the old
 *  MembershipPlanRow (edit / activate / delete), reflowed to fit a narrow column. */
export function PlanRailRow({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(plan.name)
  const [price, setPrice] = useState(plan.monthly_price_aed?.toString() ?? '')
  const [planRef, setPlanRef] = useState(plan.provider_plan_ref ?? '')
  const [isTrial, setIsTrial] = useState(plan.is_trial)
  const [trialDays, setTrialDays] = useState(plan.trial_days?.toString() ?? '')
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const r = await fn()
      if (r.error) alert(r.error)
      else setEditing(false)
    })

  function reset() {
    setEditing(false)
    setName(plan.name)
    setPrice(plan.monthly_price_aed?.toString() ?? '')
    setPlanRef(plan.provider_plan_ref ?? '')
    setIsTrial(plan.is_trial)
    setTrialDays(plan.trial_days?.toString() ?? '')
  }

  if (editing) {
    return (
      <div className="space-y-2 border-b border-line px-4 py-3 last:border-0">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" className={inputClass} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} step="0.01" placeholder="Monthly price (AED)" className={inputClass} />
        <input value={planRef} onChange={(e) => setPlanRef(e.target.value)} placeholder="Stripe Price ID" className={cn(inputClass, 'font-mono')} />
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} className="accent-[var(--accent)]" /> Trial
          {isTrial && <input value={trialDays} onChange={(e) => setTrialDays(e.target.value)} type="number" min={1} placeholder="days" className={cn(inputClass, 'w-20')} />}
        </label>
        <div className="flex gap-3">
          <button
            className={cn(miniBtn, 'text-accent-ink')}
            disabled={pending}
            onClick={() => run(() => editMembershipPlan(plan.id, name, price.trim() ? parseFloat(price) : null, planRef.trim() || null, isTrial, isTrial && trialDays.trim() ? parseInt(trialDays) : null))}
          >
            Save
          </button>
          <button className={miniBtn} disabled={pending} onClick={reset}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('border-b border-line px-4 py-2.5 last:border-0', !plan.active && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">
            {plan.name}
            {plan.is_trial && <span className="ml-1.5 font-mono text-[10px] font-bold text-accent-ink">TRIAL · {plan.trial_days}d</span>}
          </div>
          <div className="font-mono text-[11px] text-ink-3">
            {plan.monthly_price_aed != null ? `AED ${plan.monthly_price_aed} / mo` : plan.is_trial ? `${plan.trial_days} days · free` : '—'}
          </div>
        </div>
        <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', plan.active ? 'bg-ok-soft text-ok' : 'border border-line bg-surface-2 text-ink-3')}>
          {plan.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="mt-1.5 flex gap-3">
        <button className={miniBtn} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
        <button className={miniBtn} disabled={pending} onClick={() => run(() => toggleMembershipPlan(plan.id, !plan.active))}>{plan.active ? 'Deactivate' : 'Activate'}</button>
        <button className={cn(miniBtn, 'text-danger hover:text-danger')} disabled={pending} onClick={() => { if (confirm('Delete this plan?')) run(() => deleteMembershipPlan(plan.id)) }}>Delete</button>
      </div>
    </div>
  )
}
