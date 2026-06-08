'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTvToken } from '../_actions/set-tv-token'

const btn: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)',
  cursor: 'pointer', fontFamily: 'inherit',
}

export function TvDisplayCard({ link }: { link: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setTvToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }
  function copy() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>TV display</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
        A public, read-only board for a gym-floor TV — today&apos;s WOD, the live leaderboard, and PRs. Anyone with the link can view it, so keep it private; regenerate to revoke the old one.
      </p>
      {link ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)', fontSize: 12.5, fontFamily: 'var(--font-geist-mono, monospace)' }} />
            <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={pending} onClick={() => act('generate')} style={btn}>Regenerate</button>
            <button type="button" disabled={pending} onClick={() => act('disable')} style={{ ...btn, color: 'var(--c-danger)' }}>Disable</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => act('generate')} style={{ ...btn, marginTop: 12, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)', fontWeight: 700 }}>Generate link</button>
      )}
    </div>
  )
}
