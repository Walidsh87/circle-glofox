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
    <button
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
    >
      {pending ? '…' : 'Mark rewarded'}
    </button>
  )
}
