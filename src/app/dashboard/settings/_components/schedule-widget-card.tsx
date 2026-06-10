'use client'

import { useState } from 'react'

export function ScheduleWidgetCard({ snippet }: { snippet: string | null }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!snippet) return
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>Schedule widget</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
        Embed your public class timetable on your website. Read-only; visitors click “Book / Log in” to reserve.
      </p>
      {snippet ? (
        <>
          <pre style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-ink-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{snippet}</pre>
          <button onClick={copy} style={{ marginTop: 10, height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? 'Copied!' : 'Copy embed code'}
          </button>
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 12 }}>Set your gym’s public URL slug above to generate the embed code.</p>
      )}
    </div>
  )
}
