'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refundInvoice } from '../_actions/refund-invoice'

export function RefundForm({
  invoiceId,
  remainingAed,
}: {
  invoiceId: string
  remainingAed: number
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(remainingAed.toFixed(2))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = Number(amount)
    startTransition(async () => {
      const result = await refundInvoice(invoiceId, amt, reason)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  if (remainingAed <= 0) {
    return <span style={{ fontSize: 12, color: '#888' }}>Fully refunded</span>
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          height: 36, padding: '0 18px',
          background: 'white', color: '#111', border: '1.5px solid #111',
          borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Refund
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'white', border: '1.5px solid #111', borderRadius: 10,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Issue refund</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888' }}>Amount (AED)</span>
        <input
          type="number" step="0.01" min="0.01" max={remainingAed}
          value={amount} onChange={(e) => setAmount(e.target.value)} required
          style={{ height: 36, padding: '0 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
        />
        <span style={{ fontSize: 11, color: '#888' }}>Remaining: AED {remainingAed.toFixed(2)}</span>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888' }}>Reason (optional)</span>
        <input
          type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
          placeholder="Member cancelled mid-cycle"
          style={{ height: 36, padding: '0 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
        />
      </label>
      {error && <div style={{ fontSize: 12, color: '#b00020' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} style={{
          flex: 1, height: 36, background: 'white', border: '1px solid #ccc',
          borderRadius: 6, fontSize: 13, cursor: 'pointer',
        }}>
          Cancel
        </button>
        <button type="submit" disabled={pending} style={{
          flex: 1, height: 36, background: pending ? '#ccc' : '#111', color: 'white',
          border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700,
          cursor: pending ? 'not-allowed' : 'pointer',
        }}>
          {pending ? 'Refunding…' : 'Confirm refund'}
        </button>
      </div>
    </form>
  )
}
