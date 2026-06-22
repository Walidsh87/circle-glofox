'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDebrief } from '../_actions/debrief'

export function DeleteDebriefButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const res = await deleteDebrief(id)
        if (res.error) { alert(res.error); return }
        router.refresh()
      })}
      className="ml-auto text-[11px] text-ink-faint underline hover:text-ink-3 disabled:opacity-50"
    >
      delete
    </button>
  )
}
