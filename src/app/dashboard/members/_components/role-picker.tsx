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
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <select value={role} disabled={pending} onChange={(e) => onChange(e.target.value)} aria-label="Staff role" style={{ height: 28, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 12, color: 'var(--c-ink)', padding: '0 6px' }}>
        <option value="admin">Admin</option>
        <option value="coach">Coach</option>
        <option value="receptionist">Receptionist</option>
      </select>
      {error && <span style={{ fontSize: 11, color: 'var(--c-danger)' }}>{error}</span>}
    </span>
  )
}
