'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createHousehold, addToHousehold, removeFromHousehold } from '../_actions/household'

type HH = { id: string; name: string; primaryAthleteId: string }
type Person = { id: string; full_name: string }

const inpClass =
  'h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function HouseholdCard({ memberId, household, members, allHouseholds }: {
  memberId: string
  household: HH | null
  members: Person[]
  allHouseholds: { id: string; name: string }[]
}) {
  const [name, setName] = useState('')
  const [pick, setPick] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })

  if (household) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="text-[13.5px] font-semibold text-ink">{household.name}</div>
        <div className="flex flex-col gap-1">
          {members.map((p) => (
            <div key={p.id} className="text-xs text-ink-2">
              {p.full_name}
              {p.id === household.primaryAthleteId && (
                <span className="ml-1.5 font-mono text-[10px] font-bold text-accent-ink">PAYER</span>
              )}
            </div>
          ))}
        </div>
        {memberId !== household.primaryAthleteId && (
          <div className="text-xs text-ink-3">Covered by the household payer’s membership.</div>
        )}
        <Button variant="outline" size="sm" className="self-start" disabled={pending} onClick={() => run(() => removeFromHousehold(memberId))}>
          Remove from household
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New household name" className={`${inpClass} w-[180px]`} />
        <Button size="sm" className="h-8 text-xs" disabled={pending || !name.trim()} onClick={() => run(() => createHousehold(memberId, name))}>
          Create (this member is payer)
        </Button>
      </div>
      {allHouseholds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inpClass}>
            <option value="">Add to existing…</option>
            {allHouseholds.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending || !pick} onClick={() => run(() => addToHousehold(pick, memberId))}>
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
