'use client'

import { useState } from 'react'
import { markPaid, markUnpaid } from '../_actions/mark-paid'
import { createCheckout } from '../_actions/create-checkout'

type Props = {
  membershipId: string
  currentStatus: string
  hasStripePlan: boolean
  stripeConnected: boolean
}

export function PaymentActions({ membershipId, currentStatus, hasStripePlan, stripeConnected }: Props) {
  const [loading, setLoading] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const isPaid = currentStatus === 'paid'

  async function handleToggle() {
    setLoading(true)
    const { error } = isPaid ? await markUnpaid(membershipId) : await markPaid(membershipId)
    if (error) alert(error)
    setLoading(false)
  }

  async function handleSendLink() {
    setLoading(true)
    const { error, url } = await createCheckout(membershipId)
    if (error) { alert(error); setLoading(false); return }
    setCheckoutUrl(url)
    setLoading(false)
  }

  function handleCopy() {
    if (checkoutUrl) navigator.clipboard.writeText(checkoutUrl)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      {stripeConnected && hasStripePlan && !checkoutUrl && (
        <button
          onClick={handleSendLink}
          disabled={loading}
          style={{
            height: 30, padding: '0 12px',
            background: 'var(--circle-lime-soft)',
            border: '1px solid var(--circle-lime)',
            borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600,
            color: 'var(--circle-lime-ink)',
            fontFamily: 'inherit',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '…' : 'Send link'}
        </button>
      )}
      {checkoutUrl && (
        <button
          onClick={handleCopy}
          style={{
            height: 30, padding: '0 12px',
            background: 'var(--c-ok-soft)', border: '1px solid var(--c-ok-ink)',
            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            color: 'var(--c-ok-ink)', fontFamily: 'inherit',
          }}
          title={checkoutUrl}
        >
          Copy link ✓
        </button>
      )}
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
    </div>
  )
}
