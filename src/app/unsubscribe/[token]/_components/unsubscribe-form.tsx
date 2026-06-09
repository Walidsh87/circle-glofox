'use client'

import { useState, useTransition } from 'react'
import { unsubscribe } from '../_actions/unsubscribe'

export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [gym, setGym] = useState<string | null>(null)
  const [found, setFound] = useState(true)
  const [pending, start] = useTransition()

  function onClick() {
    start(async () => {
      const res = await unsubscribe(token)
      setGym(res.gymName)
      setFound(res.gymName !== null)
      setDone(true)
    })
  }

  if (done) {
    return (
      <p style={{ fontSize: 15, color: 'var(--c-ink)' }}>
        {found
          ? `You've been unsubscribed${gym ? ` from ${gym} emails` : ''}. You won't receive further broadcasts.`
          : 'This unsubscribe link is no longer valid.'}
      </p>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      style={{ padding: '12px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
    >
      {pending ? 'Unsubscribing…' : 'Unsubscribe me'}
    </button>
  )
}
