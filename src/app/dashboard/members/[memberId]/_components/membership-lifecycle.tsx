'use client'

import { useState, useTransition } from 'react'
import { freezeMembership, resumeMembership } from '@/app/dashboard/payments/_actions/freeze-membership'
import { scheduleCancellation, undoScheduledCancellation } from '@/app/dashboard/payments/_actions/schedule-cancellation'

const box: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }
const btn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-ink-2)' }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Freeze */}
      {isFrozen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-warn-ink)' }}>
            ❄️ Frozen{frozenUntil ? ` until ${frozenUntil}` : ''}
          </span>
          <button style={ghost} disabled={pending} onClick={() => run(() => resumeMembership(membershipId))}>Resume now</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Freeze from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={box} /></label>
          <label style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>until <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={box} /></label>
          <button style={btn} disabled={pending} onClick={() => run(() => freezeMembership(membershipId, from, until || null))}>Freeze</button>
        </div>
      )}

      {/* Scheduled cancellation */}
      {cancelScheduled ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger)' }}>Cancels on {endDate}</span>
          <button style={ghost} disabled={pending} onClick={() => run(() => undoScheduledCancellation(membershipId))}>Undo</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Cancel at end of period <input type="date" value={cancelOn} onChange={(e) => setCancelOn(e.target.value)} style={box} /></label>
          <button style={ghost} disabled={pending || !cancelOn} onClick={() => run(() => scheduleCancellation(membershipId, cancelOn))}>Schedule</button>
        </div>
      )}
    </div>
  )
}
