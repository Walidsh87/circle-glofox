'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { sendMessage } from '../_actions/send-message'

export function Composer({ memberId, navigateToThread = false, waHint }: { memberId: string; navigateToThread?: boolean; waHint?: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSend() {
    if (!body.trim()) return
    setError(null)
    start(async () => {
      const res = await sendMessage(memberId, body)
      if (res.error) { setError(res.error); return }
      setBody('')
      if (navigateToThread && res.conversationId) router.push(`/dashboard/inbox/${res.conversationId}`)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
      {waHint && <p className="text-[11.5px] text-ink-3">{waHint}</p>}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          placeholder="Type a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        />
        <Button onClick={onSend} disabled={pending || !body.trim()}>
          {pending ? '…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
