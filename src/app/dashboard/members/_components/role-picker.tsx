'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changeStaffRole } from '../_actions/change-staff-role'

export function RolePicker({ profileId, role }: { profileId: string; role: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onChange(next: string) {
    if (next === role) return
    setError(null)
    start(async () => {
      const res = await changeStaffRole(profileId, next)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <select
        value={role}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Staff role"
        className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <option value="admin">Admin</option>
        <option value="coach">Coach</option>
        <option value="receptionist">Receptionist</option>
      </select>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
