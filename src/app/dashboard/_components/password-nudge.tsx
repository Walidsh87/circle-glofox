'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'pw-nudge-dismissed'

export function PasswordNudge({ show }: { show: boolean }) {
  // localStorage is read in an effect so server and first client render agree (both hidden).
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (show && !localStorage.getItem(DISMISS_KEY)) setVisible(true)
  }, [show])
  if (!visible) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 10, background: 'var(--circle-lime-soft)', border: '1px solid var(--circle-lime)', marginBottom: 20 }}>
      <span style={{ fontSize: 13, color: 'var(--c-ink)' }}>Set a password to sign in faster next time.</span>
      <Link href="/dashboard/profile" style={{ fontSize: 13, fontWeight: 700, color: 'var(--circle-lime-ink)', textDecoration: 'none' }}>Set password →</Link>
      <button aria-label="Dismiss" onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setVisible(false) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-ink-muted)', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  )
}
