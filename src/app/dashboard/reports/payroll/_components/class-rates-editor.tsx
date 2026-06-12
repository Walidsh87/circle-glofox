'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveClassRate, deleteClassRate } from '../_actions/class-rates'

type Template = { id: string; name: string }
type Rate = { id: string; template_id: string; rate_aed: number }

export function ClassRatesEditor({ coachId, templates, rates }: { coachId: string; templates: Template[]; rates: Rate[] }) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState('')
  const [rate, setRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const nameOf = (tid: string) => templates.find((t) => t.id === tid)?.name ?? 'Class'

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-ink-3 hover:text-ink">
        Class-type rates{rates.length > 0 ? ` (${rates.length})` : ''}
      </summary>
      <div className="mt-1.5 flex flex-col gap-1">
        {rates.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-[11.5px] text-ink-2">
            <span>{nameOf(r.template_id)} · {r.rate_aed} AED</span>
            <button
              onClick={() => start(async () => { const res = await deleteClassRate(r.id); if (res.error) setError(res.error); else router.refresh() })}
              disabled={pending}
              className="text-ink-3 underline hover:text-ink"
            >
              remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Class type"
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink">
            <option value="">Class type…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="AED" inputMode="decimal" aria-label="Rate (AED)"
            className="h-7 w-16 rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink" />
          <button
            onClick={() => {
              if (!templateId) { setError('Pick a class type.'); return }
              setError(null)
              start(async () => {
                const res = await saveClassRate(coachId, templateId, Number(rate))
                if (res.error) setError(res.error)
                else { setTemplateId(''); setRate(''); router.refresh() }
              })
            }}
            disabled={pending}
            className="h-7 rounded-md border border-line bg-surface px-2 text-[11.5px] font-semibold text-ink hover:border-line-strong"
          >
            {pending ? '…' : 'Save'}
          </button>
        </div>
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    </details>
  )
}
