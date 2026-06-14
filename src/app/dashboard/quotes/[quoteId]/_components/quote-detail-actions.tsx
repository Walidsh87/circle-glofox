'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { sendQuote } from '../../_actions/send-quote'
import { voidQuote, deleteQuote } from '../../_actions/quote-lifecycle'

export function QuoteDetailActions({ quoteId, status, publicUrl }: { quoteId: string; status: string; publicUrl: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else { after?.(); router.refresh() }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && <Button size="sm" disabled={pending} onClick={() => run(() => sendQuote(quoteId))}>Send to buyer</Button>}
      {status === 'draft' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteQuote(quoteId), () => router.push('/dashboard/quotes'))}>Delete</Button>}
      {(status === 'sent' || status === 'accepted') && publicUrl && (
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy public link</Button>
      )}
      {(status === 'sent' || status === 'accepted') && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => voidQuote(quoteId))}>Void</Button>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}
