'use client'

import { useState, useTransition } from 'react'
import { resetStaffMfa } from '../_actions/reset-staff-mfa'

export function ResetMfaButton({ profileId, name }: { profileId: string; name: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Reset two-factor for ${name}? They'll log in with password only until they re-enroll.`)) return
          setMsg(null)
          start(async () => {
            const res = await resetStaffMfa(profileId)
            setMsg(res.error ?? 'MFA cleared.')
          })
        }}
        className="h-7 rounded-md border border-line bg-surface px-2 text-xs text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {pending ? '…' : 'Reset MFA'}
      </button>
      {msg && <span className="text-[11px] text-ink-3">{msg}</span>}
    </span>
  )
}
