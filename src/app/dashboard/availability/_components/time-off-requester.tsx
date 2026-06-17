'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { requestTimeOff } from '../_actions/time-off'

export function TimeOffRequester({ coachId, ctaLabel }: { coachId: string; ctaLabel: string }) {
  const router = useRouter()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  const submit = () => startT(async () => {
    setError(null)
    const r = await requestTimeOff(coachId, start, end, reason)
    if (r.error) setError(r.error)
    else { setStart(''); setEnd(''); setReason(''); router.refresh() }
  })

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5 text-[11px] text-ink-3">From
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" /></label>
      <label className="flex flex-col gap-0.5 text-[11px] text-ink-3">To
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" /></label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)"
        className="h-8 min-w-[140px] flex-1 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink placeholder:text-ink-faint" />
      <Button size="sm" className="h-8 px-3 text-xs" disabled={pending || !start || !end} onClick={submit}>{ctaLabel}</Button>
      {error && <span role="alert" className="w-full text-[12px] text-danger">{error}</span>}
    </div>
  )
}
