'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { freezeMembership, resumeMembership } from '@/app/dashboard/payments/_actions/freeze-membership'
import { scheduleCancellation, undoScheduledCancellation } from '@/app/dashboard/payments/_actions/schedule-cancellation'

const boxClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function MembershipLifecycle({
  membershipId, frozenFrom, frozenUntil, endDate, today,
}: {
  membershipId: string
  frozenFrom: string | null
  frozenUntil: string | null
  endDate: string | null
  today: string
}) {
  const [from, setFrom] = useState(today)
  const [until, setUntil] = useState('')
  const [cancelOn, setCancelOn] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })

  const isFrozen = !!frozenFrom && frozenFrom <= today && (frozenUntil == null || today < frozenUntil)
  const cancelScheduled = !!endDate && endDate >= today

  return (
    <div className="flex flex-col gap-3">
      {/* Freeze */}
      {isFrozen ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold text-warn">
            ❄️ Frozen{frozenUntil ? ` until ${frozenUntil}` : ''}
          </span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => resumeMembership(membershipId))}>
            Resume now
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            Freeze from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={boxClass} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            until <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={boxClass} />
          </label>
          <Button size="sm" disabled={pending} onClick={() => run(() => freezeMembership(membershipId, from, until || null))}>
            Freeze
          </Button>
        </div>
      )}

      {/* Scheduled cancellation */}
      {cancelScheduled ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold text-danger">Cancels on {endDate}</span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => undoScheduledCancellation(membershipId))}>
            Undo
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            Cancel at end of period <input type="date" value={cancelOn} onChange={(e) => setCancelOn(e.target.value)} className={boxClass} />
          </label>
          <Button variant="outline" size="sm" disabled={pending || !cancelOn} onClick={() => run(() => scheduleCancellation(membershipId, cancelOn))}>
            Schedule
          </Button>
        </div>
      )}
    </div>
  )
}
