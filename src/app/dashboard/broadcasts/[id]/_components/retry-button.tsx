'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
    <span className="inline-flex items-center gap-2.5">
      <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
        {pending ? 'Retrying…' : 'Retry failed'}
      </Button>
      {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
    </span>
  )
}
