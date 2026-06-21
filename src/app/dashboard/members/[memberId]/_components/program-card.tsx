'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { duplicateProgram } from '../_actions/program'

const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const input = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

type ProgramRow = { id: string; title: string; source: 'coach' | 'bought'; sessionCount: number }

export function ProgramCard({
  athleteId,
  programs,
  canManage,
  members,
}: {
  athleteId: string
  programs: ProgramRow[]
  canManage: boolean
  members: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [dupTo, setDupTo] = useState('')
  const [dupFrom, setDupFrom] = useState(programs[0]?.id ?? '')

  function duplicate() {
    if (!dupFrom || !dupTo) return
    start(async () => {
      const res = await duplicateProgram(dupFrom, dupTo)
      if (res.error) { alert(res.error); return }
      setDupTo('')
      alert('Program duplicated.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {programs.length === 0 ? (
        <p className="text-[13px] text-ink-3">No program yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {programs.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
              <span>
                <span className="font-semibold text-ink">{p.title}</span> · {p.sessionCount} session{p.sessionCount === 1 ? '' : 's'}
                {p.source === 'bought' && <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">bought</span>}
              </span>
              {canManage && (
                <Link href={`/dashboard/members/${athleteId}/program?program=${p.id}`} className={btn}>Edit</Link>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/members/${athleteId}/program?program=new`} className={btn}>
            {programs.length > 0 ? 'Build another' : 'Build a program'}
          </Link>
          {programs.length > 0 && members.length > 0 && (
            <span className="flex items-center gap-1.5">
              {programs.length > 1 && (
                <select className={input} value={dupFrom} onChange={(e) => setDupFrom(e.target.value)} aria-label="Program to duplicate">
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              )}
              <select className={input} value={dupTo} onChange={(e) => setDupTo(e.target.value)} aria-label="Duplicate to member">
                <option value="">Duplicate to…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button type="button" className={btn} disabled={pending || !dupFrom || !dupTo} onClick={duplicate}>Copy</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
