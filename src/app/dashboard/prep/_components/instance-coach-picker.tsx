'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setInstanceCoach } from '@/app/dashboard/reports/payroll/_actions/set-instance-coach'

type Coach = { id: string; full_name: string | null }

export function InstanceCoachPicker({ instanceId, coachId, coaches }: { instanceId: string; coachId: string | null; coaches: Coach[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={coachId ?? ''}
        disabled={pending}
        aria-label="Class coach"
        onChange={(e) => {
          const next = e.target.value || null
          setError(null)
          start(async () => {
            const res = await setInstanceCoach(instanceId, next)
            if (res.error) setError(res.error)
            else router.refresh()
          })
        }}
        className="h-6 rounded-md border border-line bg-surface px-1 font-mono text-[11px] text-ink-2"
      >
        <option value="">No coach</option>
        {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name ?? 'Coach'}</option>)}
      </select>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
