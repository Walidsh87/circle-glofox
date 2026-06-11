'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCalendarToken } from '../_actions/set-calendar-token'

const btn: React.CSSProperties = { height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }

export function CalendarSyncCard({ feedUrl }: { feedUrl: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setCalendarToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }
  function copy() {
    if (!feedUrl) return
    navigator.clipboard.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <details style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, boxShadow: 'var(--c-shadow-sm)' }}>
      <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', cursor: 'pointer' }}>📅 Sync to your calendar</summary>
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          Subscribe once and your booked classes appear in Google, Apple, or Outlook — cancellations disappear automatically. Keep the link private; regenerate to revoke it.
        </p>
        {feedUrl ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)', fontSize: 11.5, fontFamily: 'var(--font-geist-mono, monospace)' }} />
              <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button type="button" disabled={pending} onClick={() => act('generate')} style={btn}>Regenerate</button>
              <button type="button" disabled={pending} onClick={() => act('disable')} style={{ ...btn, color: 'var(--c-danger)' }}>Disable</button>
              <span style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>Calendar app → add calendar → “From URL”.</span>
            </div>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => act('generate')} style={{ ...btn, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)', fontWeight: 700 }}>Enable calendar feed</button>
        )}
      </div>
    </details>
  )
}
