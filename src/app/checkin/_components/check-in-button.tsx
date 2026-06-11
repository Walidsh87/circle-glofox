'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button onClick={onCheckIn} disabled={pending} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? 'Checking in…' : 'Check in'}
      </button>
      {error && <p style={{ fontSize: 12, color: 'var(--c-danger)', margin: 0, textAlign: 'right' }}>{error}</p>}
    </div>
  )
}
