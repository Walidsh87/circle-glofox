'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
      {waHint && <p style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{waHint}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' }}
          placeholder="Type a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        />
        <button onClick={onSend} disabled={pending || !body.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending || !body.trim() ? 0.6 : 1 }}>
          {pending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
