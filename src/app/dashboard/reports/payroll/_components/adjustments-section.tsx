'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addPayAdjustment, deletePayAdjustment } from '../_actions/pay-adjustments'

type Coach = { id: string; name: string }
type Item = { id: string; coach_id: string; amount_aed: number; note: string }

export function AdjustmentsSection({ month, coaches, items }: { month: string; coaches: Coach[]; items: Item[] }) {
  const router = useRouter()
  const [coachId, setCoachId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const nameOf = (id: string) => coaches.find((c) => c.id === id)?.name ?? 'Coach'

  return (
    <div className="mt-5">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Adjustments — {month}</h2>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 && <p className="text-[12.5px] text-ink-3">No bonus or deduction lines this month.</p>}
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-2.5 text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{nameOf(a.coach_id)}</span>
            <span className={a.amount_aed < 0 ? 'font-mono text-danger' : 'font-mono text-ok'}>
              {a.amount_aed < 0 ? `−${Math.abs(a.amount_aed)}` : `+${a.amount_aed}`} AED
            </span>
            <span className="text-ink-3">{a.note}</span>
            <button
              onClick={() => start(async () => { const res = await deletePayAdjustment(a.id); if (res.error) setError(res.error); else router.refresh() })}
              disabled={pending}
              className="text-[11.5px] text-ink-3 underline hover:text-ink"
            >
              remove
            </button>
          </div>
        ))}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="Coach"
            className="h-8 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink">
            <option value="">Coach…</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="±AED" inputMode="decimal" aria-label="Amount (AED)"
            className="h-8 w-20 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required)" aria-label="Note"
            className="h-8 w-56 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink" />
          <button
            onClick={() => {
              if (!coachId) { setError('Pick a coach.'); return }
              setError(null)
              start(async () => {
                const res = await addPayAdjustment(coachId, month, Number(amount), note)
                if (res.error) setError(res.error)
                else { setCoachId(''); setAmount(''); setNote(''); router.refresh() }
              })
            }}
            disabled={pending}
            className="h-8 rounded-md border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink hover:border-line-strong"
          >
            {pending ? '…' : 'Add'}
          </button>
        </div>
        {error && <span className="text-[11.5px] text-danger">{error}</span>}
      </div>
    </div>
  )
}
