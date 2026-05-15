'use client'

import { useState } from 'react'
import { markPaid, markUnpaid } from '../_actions/mark-paid'

export function PaymentActions({ membershipId, currentStatus }: { membershipId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false)
  const isPaid = currentStatus === 'paid'

  async function handleToggle() {
    setLoading(true)
    const { error } = isPaid ? await markUnpaid(membershipId) : await markPaid(membershipId)
    if (error) alert(error)
    setLoading(false)
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      style={{
        height: 30, padding: '0 12px',
        background: 'transparent',
        border: '1px solid var(--c-border)',
        borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 12.5, fontWeight: 500,
        color: isPaid ? 'var(--c-ink-muted)' : 'var(--c-ok-ink)',
        fontFamily: 'inherit', transition: 'opacity 120ms',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? '…' : isPaid ? 'Mark unpaid' : 'Mark paid'}
    </button>
  )
}
