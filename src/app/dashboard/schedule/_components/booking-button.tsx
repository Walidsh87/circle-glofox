'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-ink-3">
            On waitlist · #{waitlistPosition ?? '–'}
          </span>
          <button
            onClick={handleLeave}
            disabled={loading}
            className="h-7 rounded-[7px] border border-line bg-transparent px-2.5 text-xs font-semibold text-ink-2 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Leave
          </button>
        </div>
      )
    }
    return (
      <button
        onClick={handleJoin}
        disabled={loading}
        className="h-[30px] rounded-[7px] border border-line-strong bg-surface px-3.5 text-[12.5px] font-bold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? '…' : 'Join waitlist'}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={cn(
          'h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
          isBooked
            ? 'border border-line bg-transparent text-ink-2 hover:border-line-strong'
            : 'bg-accent text-accent-contrast hover:bg-accent-hover'
        )}
      >
        {loading ? '…' : isBooked ? 'Cancel' : 'Book'}
      </button>
      {needsCredits && (
        <Link href="/dashboard/shop" className="text-[11px] text-accent-ink underline">
          Need a class credit — buy a pack
        </Link>
      )}
    </div>
  )
}
