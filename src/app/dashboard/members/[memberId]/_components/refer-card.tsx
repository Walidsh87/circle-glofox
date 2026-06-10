'use client'

import { useState } from 'react'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', lineHeight: 1.5 }}>Share your link — friends who sign up are credited to you.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input readOnly value={link} style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-bg)', fontSize: 12.5, color: 'var(--c-ink-2)' }} />
        <button onClick={copy} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer' }}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
      <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{referred} referred · {joined} joined</div>
    </div>
  )
}
