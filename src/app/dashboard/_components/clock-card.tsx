'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { clockIn, clockOut } from '../_actions/timecards'

export function ClockCard({ openSince, timeZone }: { openSince: string | null; timeZone: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const since = openSince
    ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(openSince))
    : null

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <Card className="mb-4 flex items-center justify-between gap-3 p-4">
      <div>
        <div className="font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Timecard</div>
        <div className="mt-0.5 text-[13.5px] text-ink">{since ? `On the clock since ${since}` : 'Off the clock'}</div>
        {error && <div className="mt-1 text-xs text-danger">{error}</div>}
      </div>
      <Button variant={since ? 'outline' : undefined} size="sm" disabled={pending} onClick={() => run(since ? clockOut : clockIn)}>
        {pending ? '…' : since ? 'Clock out' : 'Clock in'}
      </Button>
    </Card>
  )
}
