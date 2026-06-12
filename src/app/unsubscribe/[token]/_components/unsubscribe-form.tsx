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
      <p className="text-[15px] text-ink">
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
      className="rounded-lg bg-accent px-5 py-3 font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
    >
      {pending ? 'Unsubscribing…' : 'Unsubscribe me'}
    </button>
  )
}
