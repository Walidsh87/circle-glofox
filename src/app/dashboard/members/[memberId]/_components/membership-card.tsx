'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { requestPlanChange } from '../_actions/request-plan-change'

type Plan = { id: string; name: string; monthly_price_aed: number | null }

export function MembershipCard({ currentPlanName, currentPriceAed, plans, pendingTo }: {
  currentPlanName: string | null
  currentPriceAed: number | null
  plans: Plan[]
  pendingTo: string | null
}) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(pendingTo)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  if (!currentPlanName) {
    return <div className="text-[13px] text-ink-3">No active membership — ask at the front desk.</div>
  }

  const others = plans.filter((p) => p.name !== currentPlanName)

  return (
    <div>
      <div className="text-[13.5px] text-ink">
        {currentPlanName}
        {currentPriceAed != null && <span className="text-ink-3"> · AED {currentPriceAed}/month</span>}
      </div>

      {pendingPlan ? (
        <p className="mt-1.5 text-[13px] text-ink-2">
          Pending request: → <strong>{pendingPlan}</strong> — the front desk will confirm with you.
        </p>
      ) : others.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink-2">Request a plan change</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {others.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-t border-line pt-1.5">
                <span className="text-[13px] text-ink-2">
                  {p.name}
                  {p.monthly_price_aed != null && <span className="text-ink-3"> · AED {p.monthly_price_aed}/mo</span>}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => startTransition(async () => {
                    setError(null)
                    const res = await requestPlanChange(p.id)
                    if (res.error) setError(res.error)
                    else setPendingPlan(p.name)
                  })}
                >
                  Request
                </Button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  )
}
