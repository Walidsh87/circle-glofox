'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decideTimeOff, cancelTimeOff } from '../_actions/time-off'

export function TimeOffRowActions(
  { id, status, canApprove, canCancel }: { id: string; status: string; canApprove: boolean; canCancel: boolean },
) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) =>
    startT(async () => { setError(null); const r = await fn(); if (r.error) setError(r.error); else router.refresh() })

  const btn = 'rounded-md px-2 py-0.5 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50'

  return (
    <span className="inline-flex items-center gap-1.5">
      {canApprove && status === 'pending' && (
        <>
          <button disabled={pending} onClick={() => run(() => decideTimeOff(id, 'approved'))}
            className={`${btn} bg-ok-soft text-ok hover:brightness-95`}>Approve</button>
          <button disabled={pending} onClick={() => run(() => decideTimeOff(id, 'denied'))}
            className={`${btn} bg-danger-soft text-danger hover:brightness-95`}>Deny</button>
        </>
      )}
      {canCancel && (
        <button disabled={pending} onClick={() => run(() => cancelTimeOff(id))}
          className={`${btn} text-ink-3 hover:text-danger`}>Cancel</button>
      )}
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
