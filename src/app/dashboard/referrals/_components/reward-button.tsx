'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markReferralRewarded } from '../_actions/mark-rewarded'

export function RewardButton({ memberId }: { memberId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function onClick() {
    start(async () => { await markReferralRewarded(memberId); router.refresh() })
  }
  return (
    <button onClick={onClick} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
      {pending ? '…' : 'Mark rewarded'}
    </button>
  )
}
