'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retryFailedBroadcast } from '../../_actions/retry-failed'

export function RetryButton({ broadcastId }: { broadcastId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onClick() {
    setError(null)
    start(async () => {
      const res = await retryFailedBroadcast(broadcastId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button onClick={onClick} disabled={pending} style={{ padding: '8px 14px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
        {pending ? 'Retrying…' : 'Retry failed'}
      </button>
      {error && <span style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</span>}
    </span>
  )
}
