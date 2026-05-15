'use client'

import { useState } from 'react'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'

export function BookingButton({
  instanceId,
  isBooked,
  isFull,
}: {
  instanceId: string
  isBooked: boolean
  isFull: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { error } = isBooked ? await cancelBooking(instanceId) : await bookClass(instanceId)
    if (error) alert(error)
    setLoading(false)
  }

  if (isFull && !isBooked) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px',
        borderRadius: 20, background: 'var(--c-surface-alt)',
        color: 'var(--c-ink-muted)', fontFamily: 'inherit',
      }}>
        Full
      </span>
    )
  }

  return (
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
  )
}
