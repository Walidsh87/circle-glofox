'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function ReferCard({ link, referred, joined }: { link: string | null; referred: number; joined: number }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  if (!link) return null
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs leading-relaxed text-ink-3">
        Share your link — friends who sign up are credited to you.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={link}
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
      <div className="font-mono text-xs text-ink-3">{referred} referred · {joined} joined</div>
    </div>
  )
}
