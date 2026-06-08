'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markContacted } from '../_actions/mark-contacted'

export function MarkContacted({ athleteId }: { athleteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const res = await markContacted(athleteId)
        if (res.error) { alert(res.error); return }
        router.refresh()
      })}
      style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
    >
      {pending ? 'Logging…' : 'Mark contacted'}
    </button>
  )
}
