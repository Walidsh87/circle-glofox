'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'pw-nudge-dismissed'

export function PasswordNudge({ show }: { show: boolean }) {
  // localStorage is read in an effect so server and first client render agree (both hidden).
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    setVisible(show && !localStorage.getItem(DISMISS_KEY))
  }, [show])
  if (!visible) return null
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-accent bg-accent-soft px-4 py-2.5">
      <span className="text-[13px] text-ink">Set a password to sign in faster next time.</span>
      <Link href="/dashboard/profile" className="text-[13px] font-bold text-accent-ink transition-colors hover:text-ink">
        Set password →
      </Link>
      <button
        aria-label="Dismiss"
        onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setVisible(false) }}
        className="ml-auto text-base leading-none text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >×</button>
    </div>
  )
}
