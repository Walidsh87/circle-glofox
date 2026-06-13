'use client'

import { useState, useTransition } from 'react'
import { saveRamadanWindow } from '../_actions/save-ramadan-window'

const inp =
  'h-[34px] rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'

function pretty(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ymd + 'T12:00:00Z'))
}

export function RamadanCard({ ramadanStart, ramadanEnd, suggested }: { ramadanStart: string | null; ramadanEnd: string | null; suggested: { start: string; end: string } }) {
  const [start, setStart] = useState(ramadanStart ?? '')
  const [end, setEnd] = useState(ramadanEnd ?? '')
  const [pending, run] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-surface px-5 py-[18px] shadow-card">
      <p className="mb-1 text-[13px] font-semibold text-ink">Ramadan schedule</p>
      <p className="mb-3 text-xs text-ink-3">
        While these dates are active, the generator uses your Ramadan class timetable. Leave blank to disable.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Start <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setSaved(false) }} className={inp} />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          End <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setSaved(false) }} className={inp} />
        </label>
      </div>
      <p className="mt-2.5 text-xs text-ink-3">
        Umm al-Qura estimate: {pretty(suggested.start)} – {pretty(suggested.end)}.{' '}
        <button
          type="button"
          onClick={() => { setStart(suggested.start); setEnd(suggested.end); setSaved(false) }}
          className="underline hover:text-ink"
        >Use these</button>{' '}— adjust to the official moon-sighting start.
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        <button
          disabled={pending}
          onClick={() => run(async () => { const r = await saveRamadanWindow(start || null, end || null); if (r.error) alert(r.error); else setSaved(true) })}
          className="h-[34px] rounded-lg bg-accent px-4 text-[13px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >{pending ? 'Saving…' : 'Save'}</button>
        {saved && <span className="text-[12.5px] text-ok">Saved</span>}
      </div>
    </div>
  )
}
