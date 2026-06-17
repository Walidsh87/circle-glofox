'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { WEEKDAYS } from '@/lib/coach-availability'
import { addAvailabilityWindow, removeAvailabilityWindow } from '../_actions/availability-windows'

export type AvailabilityWindow = { id: string; coach_id: string; weekday: number; start_time: string; end_time: string }

const hhmm = (t: string) => t.slice(0, 5) // '06:00:00' → '06:00'

export function WeeklyAvailabilityEditor({ coachId, windows }: { coachId: string; windows: AvailabilityWindow[] }) {
  const router = useRouter()
  const [weekday, setWeekday] = useState(1)
  const [start, setStart] = useState('06:00')
  const [end, setEnd] = useState('10:00')
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  const run = (fn: () => Promise<{ error: string | null }>) =>
    startT(async () => { setError(null); const r = await fn(); if (r.error) setError(r.error); else router.refresh() })

  const byDay = WEEKDAYS.map((_, d) => windows.filter((w) => w.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time)))

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5">
        {WEEKDAYS.map((label, d) => (
          <div key={d} className="flex flex-wrap items-center gap-2">
            <span className="w-[84px] shrink-0 text-[13px] font-medium text-ink-2">{label}</span>
            {byDay[d].length === 0 && <span className="text-xs text-ink-3">—</span>}
            {byDay[d].map((w) => (
              <span key={w.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-ink">
                {hhmm(w.start_time)}–{hhmm(w.end_time)}
                <button onClick={() => run(() => removeAvailabilityWindow(w.id))} disabled={pending}
                  aria-label={`Remove ${label} ${hhmm(w.start_time)}–${hhmm(w.end_time)}`}
                  className="leading-none text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">×</button>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}
          aria-label="Day of week"
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
          {WEEKDAYS.map((label, d) => <option key={d} value={d}>{label}</option>)}
        </select>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time"
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" />
        <span className="text-ink-3">–</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time"
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" />
        <Button size="sm" className="h-8 px-3 text-xs" disabled={pending}
          onClick={() => run(() => addAvailabilityWindow(coachId, weekday, start, end))}>Add window</Button>
        {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
      </div>
    </div>
  )
}
