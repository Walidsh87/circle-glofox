'use client'

import { useState, useTransition } from 'react'
import { saveBookingPolicy } from '../_actions/save-booking-policy'

const inp =
  'h-[34px] w-[90px] rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'

export function BookingPolicyCard({ closeMinutes, lateCancelHours, rosterPublic }: { closeMinutes: number; lateCancelHours: number; rosterPublic: boolean }) {
  const [close, setClose] = useState(String(closeMinutes))
  const [late, setLate] = useState(String(lateCancelHours))
  const [roster, setRoster] = useState(rosterPublic)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-surface px-5 py-[18px] shadow-card">
      <p className="mb-1 text-[13px] font-semibold text-ink">Booking policies</p>
      <p className="mb-3 text-xs text-ink-3">0 disables a rule.</p>
      <div className="flex flex-col gap-2.5">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="number" min={0} value={close} onChange={(e) => { setClose(e.target.value); setSaved(false) }} className={inp} /> minutes before start — bookings close
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="number" min={0} value={late} onChange={(e) => { setLate(e.target.value); setSaved(false) }} className={inp} /> hours before start — cancel forfeits the credit
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={roster} onChange={(e) => { setRoster(e.target.checked); setSaved(false) }} className="h-[15px] w-[15px] accent-accent" /> show who&apos;s booked on the schedule (first names)
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <button
          disabled={pending}
          onClick={() => start(async () => { const r = await saveBookingPolicy(parseInt(close) || 0, parseInt(late) || 0, roster); if (r.error) alert(r.error); else setSaved(true) })}
          className="h-[34px] rounded-lg bg-accent px-4 text-[13px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >{pending ? 'Saving…' : 'Save'}</button>
        {saved && <span className="text-[12.5px] text-ok">Saved</span>}
      </div>
    </div>
  )
}
