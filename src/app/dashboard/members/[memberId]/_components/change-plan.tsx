'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { computeProration } from '@/lib/proration'
import { changePlan } from '@/app/dashboard/payments/_actions/change-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null }

const selClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function ChangePlan({ membershipId, currentMonthly, anchor, today, plans }: {
  membershipId: string
  currentMonthly: number | null
  anchor: string
  today: string
  plans: Plan[]
}) {
  const [planId, setPlanId] = useState('')
  const [pending, start] = useTransition()
  if (plans.length === 0) return null

  const picked = plans.find((p) => p.id === planId)
  const pro = picked ? computeProration(currentMonthly ?? 0, picked.monthly_price_aed ?? 0, anchor, today) : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={selClass}>
          <option value="">Change plan to…</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthly_price_aed != null ? ` · ${p.monthly_price_aed} AED` : ''}</option>)}
        </select>
        {picked && (
          <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await changePlan(membershipId, planId); if (r.error) alert(r.error) })}>
            Confirm change
          </Button>
        )}
      </div>
      {pro && (
        <div className="text-xs text-ink-2">
          {pro.netAed > 0
            ? <>Member <strong className="text-danger">owes {pro.netAed} AED</strong> now</>
            : pro.netAed < 0
              ? <>Credit <strong className="text-ok">{-pro.netAed} AED</strong> to the member</>
              : <>No prorated charge</>}
          <span className="text-ink-3"> · credit {pro.creditAed} · charge {pro.chargeAed} ({pro.unusedDays}/{pro.cycleDays}d left in cycle)</span>
        </div>
      )}
    </div>
  )
}
