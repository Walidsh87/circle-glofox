'use client'

import { useState } from 'react'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'
import { Button } from '@/components/ui/button'

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
    const { error } = isBooked
      ? await cancelBooking(instanceId)
      : await bookClass(instanceId)
    if (error) alert(error)
    setLoading(false)
  }

  if (isFull && !isBooked) {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">
        Full
      </span>
    )
  }

  return (
    <Button
      size="sm"
      variant={isBooked ? 'outline' : 'default'}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? '...' : isBooked ? 'Cancel' : 'Book'}
    </Button>
  )
}
