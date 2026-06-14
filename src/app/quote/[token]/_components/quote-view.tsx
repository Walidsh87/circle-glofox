'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { acceptQuote } from '../_actions/accept-quote'
import { payQuote } from '../_actions/pay-quote'

type Line = { id: string; label: string; quantity: number; line_total_aed: number; kind: string }
type Props = {
  token: string
  status: string
  title: string
  terms: string
  buyerName: string
  lines: Line[]
  subtotalAed: number
  vatAed: number
  totalAed: number
  paid: boolean
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function QuoteView(props: Props) {
  const [status, setStatus] = useState(props.status)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (props.paid || status === 'paid') {
    return <p className="text-[13px] text-ink-3">Payment received — thank you. The gym will be in touch.</p>
  }

  function onAccept() {
    setError(null)
    start(async () => {
      const res = await acceptQuote(props.token, name)
      if (res.error) setError(res.error)
      else setStatus('accepted')
    })
  }
  function onPay() {
    setError(null)
    start(async () => {
      const res = await payQuote(props.token)
      if (res.error) setError(res.error)
      else if (res.url) window.location.href = res.url
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-[13px]">
        <tbody>
          {props.lines.map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-1.5">{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</td>
              <td className="py-1.5 text-end font-mono text-ink-3">{l.line_total_aed.toFixed(2)} AED</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[13px] text-ink-3">
        <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{props.subtotalAed.toFixed(2)} AED</span></div>
        <div className="flex justify-between"><span>VAT</span><span className="font-mono">{props.vatAed.toFixed(2)} AED</span></div>
        <div className="flex justify-between font-semibold text-ink"><span>Total</span><span className="font-mono">{props.totalAed.toFixed(2)} AED</span></div>
      </div>

      {props.terms && (
        <details className="rounded-lg border border-line p-3 text-[13px] text-ink-3">
          <summary className="cursor-pointer font-semibold text-ink">Terms</summary>
          <p className="mt-2 whitespace-pre-wrap">{props.terms}</p>
        </details>
      )}

      {status === 'sent' && (
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-ink">Type your full name to accept &amp; sign</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <Button size="sm" disabled={pending} onClick={onAccept}>{pending ? 'Signing…' : 'Accept & Sign'}</Button>
        </div>
      )}
      {status === 'accepted' && (
        <Button size="sm" disabled={pending} onClick={onPay}>{pending ? 'Opening checkout…' : 'Pay now'}</Button>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}
