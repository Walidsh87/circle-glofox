'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { savePayRate } from '../_actions/save-pay-rate'

const fieldClass =
  'h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function PayRateEditor({ coachId, baseType, baseRate, ptRate }: {
  coachId: string
  baseType: string | null
  baseRate: number | null
  ptRate: number | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [bt, setBt] = useState(baseType ?? '')
  const [br, setBr] = useState(baseRate?.toString() ?? '')
  const [pr, setPr] = useState(ptRate?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSave() {
    setError(null)
    start(async () => {
      const res = await savePayRate(
        coachId,
        bt === '' ? null : bt,
        br.trim() === '' ? null : Number(br),
        pr.trim() === '' ? null : Number(pr),
      )
      if (res.error) setError(res.error)
      else { setEditing(false); router.refresh() }
    })
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-ink-3 underline underline-offset-2 transition-colors hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Edit rates
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={bt} onChange={(e) => setBt(e.target.value)} className={fieldClass} aria-label="Base pay type">
          <option value="">No base</option>
          <option value="per_class">Per class</option>
          <option value="monthly">Monthly</option>
        </select>
        <input type="number" min={0} step="0.01" placeholder="Base AED" value={br} onChange={(e) => setBr(e.target.value)} className={`${fieldClass} w-[90px]`} aria-label="Base rate (AED)" />
        <input type="number" min={0} step="0.01" placeholder="PT AED" value={pr} onChange={(e) => setPr(e.target.value)} className={`${fieldClass} w-20`} aria-label="PT rate (AED)" />
        <Button size="sm" className="h-8 px-3 text-xs" onClick={onSave} disabled={pending}>
          {pending ? '…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => { setEditing(false); setError(null) }} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error && <p role="alert" className="m-0 text-[11.5px] text-danger">{error}</p>}
    </div>
  )
}
