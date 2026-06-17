'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPtSession } from '../_actions/cancel-pt-session'

export type PtSessionItem = { id: string; scheduled_at: string; duration_minutes: number; coach_name: string }

export function PtSessionsList(
  { sessions, timeZone, canCancel }: { sessions: PtSessionItem[]; timeZone: string; canCancel: boolean },
) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

  if (sessions.length === 0) return <p className="text-xs text-ink-3">No upcoming PT sessions.</p>

  return (
    <ul className="flex flex-col gap-1.5">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <span className="font-mono text-[12.5px] text-ink">{fmt.format(new Date(s.scheduled_at))}</span>
          <span className="text-[12px] text-ink-2">{s.coach_name} · {s.duration_minutes} min</span>
          {canCancel && (
            <button
              onClick={() => start(async () => { const r = await cancelPtSession(s.id); if (r.error) alert(r.error); else router.refresh() })}
              disabled={pending}
              className="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >Cancel</button>
          )}
        </li>
      ))}
    </ul>
  )
}
