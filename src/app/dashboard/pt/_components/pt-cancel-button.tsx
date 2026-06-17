'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPtSession } from '@/app/dashboard/members/[memberId]/_actions/cancel-pt-session'

export function PtCancelButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() => start(async () => { const r = await cancelPtSession(sessionId); if (r.error) alert(r.error); else router.refresh() })}
      disabled={pending}
      className="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >Cancel</button>
  )
}
