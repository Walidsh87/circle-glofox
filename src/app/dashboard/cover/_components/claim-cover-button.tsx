'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { claimSubRequest } from '../_actions/claim-sub-request'
import { cancelSubRequest } from '../_actions/cancel-sub-request'

export function ClaimCoverButton(
  { subRequestId, mode, label }: { subRequestId: string; mode: 'claim' | 'cancel'; label: string },
) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = () => start(async () => {
    setError(null)
    const r = await (mode === 'claim' ? claimSubRequest(subRequestId) : cancelSubRequest(subRequestId))
    if (r.error) setError(r.error)
    else router.refresh()
  })
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" variant={mode === 'claim' ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" disabled={pending} onClick={run} aria-label={label}>{label}</Button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
