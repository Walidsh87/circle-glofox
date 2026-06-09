'use client'

import { useState } from 'react'
import Link from 'next/link'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'
import { joinWaitlist } from '../_actions/join-waitlist'
import { leaveWaitlist } from '../_actions/leave-waitlist'

export function BookingButton({
  instanceId,
  isBooked,
  isFull,
  isWaitlisted,
  waitlistPosition,
}: {
  instanceId: string
  isBooked: boolean
  isFull: boolean
  isWaitlisted: boolean
  waitlistPosition: number | null
}) {
  const [loading, setLoading] = useState(false)
  const [needsCredits, setNeedsCredits] = useState(false)

  async function handleClick() {
    setLoading(true)
    setNeedsCredits(false)
    const res = isBooked ? await cancelBooking(instanceId) : await bookClass(instanceId)
    if ('needsCredits' in res && res.needsCredits) {
      setNeedsCredits(true)
    } else if (res.error) {
      alert(res.error)
    } else if ('forfeited' in res && res.forfeited) {
      alert('Late cancel — your class credit wasn’t refunded.')
    }
    setLoading(false)
  }

  async function handleJoin() {
    setLoading(true)
    const res = await joinWaitlist(instanceId)
    if (res.error) alert(res.error)
    setLoading(false)
  }

  async function handleLeave() {
    setLoading(true)
    const res = await leaveWaitlist(instanceId)
    if (res.error) alert(res.error)
    setLoading(false)
  }

  if (isFull && !isBooked) {
    if (isWaitlisted) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-ink-muted)' }}>
            On waitlist · #{waitlistPosition ?? '–'}
          </span>
          <button onClick={handleLeave} disabled={loading} style={{
            height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--c-border)',
            background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.5 : 1,
          }}>Leave</button>
        </div>
      )
    }
    return (
      <button onClick={handleJoin} disabled={loading} style={{
        height: 30, padding: '0 14px', borderRadius: 7, border: '1px solid var(--c-border-strong)',
        background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-2)',
        cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.5 : 1,
      }}>{loading ? '…' : 'Join waitlist'}</button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          height: 30, padding: '0 14px',
          background: isBooked ? 'transparent' : 'var(--circle-lime)',
          border: isBooked ? '1px solid var(--c-border)' : 'none',
          borderRadius: 7, cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 12.5, fontWeight: 700,
          color: isBooked ? 'var(--c-ink-2)' : 'var(--circle-ink)',
          fontFamily: 'inherit', transition: 'opacity 120ms',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '…' : isBooked ? 'Cancel' : 'Book'}
      </button>
      {needsCredits && (
        <Link href="/dashboard/shop" style={{ fontSize: 11, color: 'var(--circle-lime-ink)', textDecoration: 'underline' }}>
          Need a class credit — buy a pack
        </Link>
      )}
    </div>
  )
}
