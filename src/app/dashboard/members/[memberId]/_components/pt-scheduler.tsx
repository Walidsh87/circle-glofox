'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { schedulePtSession } from '../_actions/schedule-pt-session'

export function PtScheduler(
  { athleteId, coaches, ptCreditsAvailable }: { athleteId: string; coaches: { id: string; full_name: string | null }[]; ptCreditsAvailable: number },
) {
  const router = useRouter()
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (ptCreditsAvailable < 1) return null

  const submit = (force: boolean) => start(async () => {
    setError(null)
    const res = await schedulePtSession(athleteId, coachId, date, time, duration, force)
    if (res.error) { setError(res.error); setConfirm(null) }
    else if (res.warning && !force) { setConfirm(res.warning) }
    else { setConfirm(null); setDate(''); setTime(''); router.refresh() }
  })

  const inputCls = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink'

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-3">{ptCreditsAvailable} PT credit{ptCreditsAvailable !== 1 ? 's' : ''} available</p>
      <div className="flex flex-wrap items-end gap-2">
        <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="PT coach" className={inputCls}>
          {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name ?? 'Coach'}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" className={inputCls} />
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duration" className={inputCls}>
          {[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
        </select>
        <Button size="sm" className="h-8 px-3 text-xs" disabled={pending || !coachId || !date || !time} onClick={() => submit(false)}>Schedule</Button>
      </div>
      {confirm && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-warn">
          <span>{confirm}</span>
          <button onClick={() => submit(true)} disabled={pending} className="rounded-md bg-warn-soft px-2 py-0.5 font-semibold text-warn">Schedule anyway</button>
          <button onClick={() => setConfirm(null)} className="text-ink-3">Don&apos;t</button>
        </div>
      )}
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
