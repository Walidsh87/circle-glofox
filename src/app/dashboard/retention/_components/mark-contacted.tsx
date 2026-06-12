'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { markContacted } from '../_actions/mark-contacted'

export function MarkContacted({ athleteId }: { athleteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      className="shrink-0"
      onClick={() => start(async () => {
        const res = await markContacted(athleteId)
        if (res.error) { alert(res.error); return }
        router.refresh()
      })}
    >
      {pending ? 'Logging…' : 'Mark contacted'}
    </Button>
  )
}
