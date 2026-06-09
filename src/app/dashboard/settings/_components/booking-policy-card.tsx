'use client'

import { useState, useTransition } from 'react'
import { saveBookingPolicy } from '../_actions/save-booking-policy'

const card: React.CSSProperties = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', marginTop: 16, boxShadow: 'var(--c-shadow-sm)' }
const inp: React.CSSProperties = { height: 34, width: 90, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }

export function BookingPolicyCard({ closeMinutes, lateCancelHours }: { closeMinutes: number; lateCancelHours: number }) {
  const [close, setClose] = useState(String(closeMinutes))
  const [late, setLate] = useState(String(lateCancelHours))
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <div style={card}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 4 }}>Booking policies</p>
      <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginBottom: 12 }}>0 disables a rule.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-ink-2)' }}>
          <input type="number" min={0} value={close} onChange={(e) => { setClose(e.target.value); setSaved(false) }} style={inp} /> minutes before start — bookings close
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-ink-2)' }}>
          <input type="number" min={0} value={late} onChange={(e) => { setLate(e.target.value); setSaved(false) }} style={inp} /> hours before start — cancel forfeits the credit
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button
          disabled={pending}
          onClick={() => start(async () => { const r = await saveBookingPolicy(parseInt(close) || 0, parseInt(late) || 0); if (r.error) alert(r.error); else setSaved(true) })}
          style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >{pending ? 'Saving…' : 'Save'}</button>
        {saved && <span style={{ fontSize: 12.5, color: 'var(--c-ok-ink)' }}>Saved</span>}
      </div>
    </div>
  )
}
