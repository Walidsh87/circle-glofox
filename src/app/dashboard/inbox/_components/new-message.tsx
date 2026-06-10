'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMessage } from '../_actions/send-message'

export type MemberOption = { id: string; full_name: string }

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

  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)' } as const

  if (members.length === 0) return null
  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>New message</button>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 12 }}>
      <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </select>
      <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Message…" value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSend} disabled={pending || !body.trim()} style={{ padding: '8px 16px', background: '#111', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>Send</button>
        <button onClick={() => setOpen(false)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--c-ink)', borderRadius: 8, border: '1px solid var(--c-border)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}
