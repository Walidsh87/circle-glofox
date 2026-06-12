'use client'

import { useState } from 'react'
import { markPaid, markUnpaid } from '../_actions/mark-paid'
import { createCheckout } from '../_actions/create-checkout'
import { cn } from '@/lib/utils'

type Props = {
  membershipId: string
  currentStatus: string
  hasStripePlan: boolean
  stripeConnected: boolean
}

const smallBtn =
  'h-8 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50'

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
    <div className="flex items-center justify-end gap-1.5">
      {stripeConnected && hasStripePlan && !checkoutUrl && (
        <button
          onClick={handleSendLink}
          disabled={loading}
          className={cn(smallBtn, 'border border-accent bg-accent-soft text-accent-ink')}
        >
          {loading ? '…' : 'Send link'}
        </button>
      )}
      {checkoutUrl && (
        <button
          onClick={handleCopy}
          className={cn(smallBtn, 'border border-ok bg-ok-soft text-ok')}
          title={checkoutUrl}
        >
          Copy link ✓
        </button>
      )}
      <button
        onClick={handleToggle}
        disabled={loading}
        className={cn(smallBtn, 'border border-line bg-transparent font-medium', isPaid ? 'text-ink-3' : 'text-ok')}
      >
        {loading ? '…' : isPaid ? 'Mark unpaid' : 'Mark paid'}
      </button>
    </div>
  )
}
