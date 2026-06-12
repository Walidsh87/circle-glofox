'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { sendMessage } from '../_actions/send-message'

export type MemberOption = { id: string; full_name: string }

const inputClass =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function NewMessage({ members }: { members: MemberOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [memberId, setMemberId] = useState(members[0]?.id ?? '')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSend() {
    if (!memberId || !body.trim()) return
    setError(null)
    start(async () => {
      const res = await sendMessage(memberId, body)
      if (res.error) { setError(res.error); return }
      if (res.conversationId) router.push(`/dashboard/inbox/${res.conversationId}`)
    })
  }

  if (members.length === 0) return null
  if (!open) {
    return <Button size="sm" onClick={() => setOpen(true)}>New message</Button>
  }
  return (
    <Card className="mb-3 flex flex-col gap-2 p-3">
      <select className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </select>
      <textarea className={cn(inputClass, 'min-h-[70px] resize-y')} placeholder="Message…" value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSend} disabled={pending || !body.trim()}>Send</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  )
}
