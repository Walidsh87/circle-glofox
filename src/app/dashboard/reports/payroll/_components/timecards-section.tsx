'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeTimecard, deleteTimecard } from '@/app/dashboard/_actions/timecards'
import { fmtHours } from '@/lib/timecards'

type CardRow = { id: string; clock_in: string; clock_out: string | null }
type Entry = { staffId: string; name: string; hours: number; open: number; cards: CardRow[] }

export function TimecardsSection({ month, timeZone, entries }: { month: string; timeZone: string; entries: Entry[] }) {
  const router = useRouter()
  const [endValue, setEndValue] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const timeOnly = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="mt-5">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Timecards — {month}</h2>
      {entries.length === 0 && <p className="text-[12.5px] text-ink-3">No clocked hours this month.</p>}
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <details key={e.staffId}>
            <summary className="cursor-pointer text-[13px] text-ink-2">
              <span className="font-semibold text-ink">{e.name}</span> · {fmtHours(e.hours)}
              {e.open > 0 && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">open card</span>}
            </summary>
            <div className="mt-1.5 flex flex-col gap-1 pl-4">
              {e.cards.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                  <span className="font-mono">
                    {fmt.format(new Date(c.clock_in))} → {c.clock_out ? timeOnly.format(new Date(c.clock_out)) : 'open'}
                  </span>
                  {c.clock_out && (
                    <span className="text-ink-3">
                      ({Math.round(((Date.parse(c.clock_out) - Date.parse(c.clock_in)) / 3600000) * 10) / 10}h)
                    </span>
                  )}
                  {!c.clock_out && (
                    <>
                      {/* datetime-local is browser-local time; the owner's browser ≈ gym TZ. */}
                      <input
                        type="datetime-local"
                        value={endValue[c.id] ?? ''}
                        onChange={(ev) => setEndValue((s) => ({ ...s, [c.id]: ev.target.value }))}
                        aria-label="End time"
                        className="h-7 rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink"
                      />
                      <button
                        onClick={() => {
                          const v = endValue[c.id]
                          if (!v) { setError('Pick an end time.'); return }
                          run(() => closeTimecard(c.id, new Date(v).toISOString()))
                        }}
                        disabled={pending}
                        className="h-7 rounded-md border border-line bg-surface px-2 text-[11.5px] font-semibold text-ink hover:border-line-strong"
                      >
                        Set end
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => run(() => deleteTimecard(c.id))}
                    disabled={pending}
                    className="text-[11.5px] text-ink-3 underline hover:text-ink"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </div>
  )
}
