'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { selfCheckIn } from '../_actions/self-check-in'

export function CheckInButton({ instanceId }: { instanceId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onCheckIn() {
    setError(null)
    start(async () => {
      const res = await selfCheckIn(instanceId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={onCheckIn} disabled={pending}>
        {pending ? 'Checking in…' : 'Check in'}
      </Button>
      {error && <p role="alert" className="text-right text-xs text-danger">{error}</p>}
    </div>
  )
}
