'use client'

import { useState } from 'react'
import { markPaid, markUnpaid } from '../_actions/mark-paid'
import { Button } from '@/components/ui/button'

export function PaymentActions({ membershipId, currentStatus }: { membershipId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    const { error } = currentStatus === 'paid'
      ? await markUnpaid(membershipId)
      : await markPaid(membershipId)
    if (error) alert(error)
    setLoading(false)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleToggle} disabled={loading}
      className={currentStatus === 'paid'
        ? 'text-gray-500 hover:text-gray-700'
        : 'text-green-600 hover:text-green-700 hover:bg-green-50'}>
      {loading ? '...' : currentStatus === 'paid' ? 'Mark unpaid' : 'Mark paid'}
    </Button>
  )
}
