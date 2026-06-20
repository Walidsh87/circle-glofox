'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { duplicateProgram } from '../_actions/program'

const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const input = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function ProgramCard({
  athleteId,
  programId,
  title,
  sessionCount,
  canManage,
  members,
}: {
  athleteId: string
  programId: string | null
  title: string | null
  sessionCount: number
  canManage: boolean
  members: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [dupTo, setDupTo] = useState('')

  function duplicate() {
    if (!programId || !dupTo) return
    start(async () => {
      const res = await duplicateProgram(programId, dupTo)
      if (res.error) { alert(res.error); return }
      setDupTo('')
      alert('Program duplicated.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {programId ? (
        <div className="text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{title}</span> · {sessionCount} session{sessionCount === 1 ? '' : 's'}
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">No program yet.</p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/members/${athleteId}/program`} className={btn}>
            {programId ? 'Edit program' : 'Build a program'}
          </Link>
          {programId && members.length > 0 && (
            <span className="flex items-center gap-1.5">
              <select className={input} value={dupTo} onChange={(e) => setDupTo(e.target.value)}>
                <option value="">Duplicate to…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button type="button" className={btn} disabled={pending || !dupTo} onClick={duplicate}>Copy</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
