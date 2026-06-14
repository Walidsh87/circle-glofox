'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createQuote } from '../../_actions/create-quote'
import type { QuoteLineInput, QuoteBuyerInput } from '@/lib/quotes'

type Pkg = { id: string; name: string; type: string; price_aed: number }
type Person = { id: string; full_name: string | null; email: string | null }
type Plan = { id: string; name: string; monthly_price_aed: number }
type DraftLine = QuoteLineInput & { key: string }

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

let counter = 0
const newKey = () => `l${counter++}`

export function QuoteBuilder({ packages, members, leads, plans, defaultTerms }: {
  packages: Pkg[]; members: Person[]; leads: Person[]; plans: Plan[]; defaultTerms: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [buyerKind, setBuyerKind] = useState<'member' | 'lead' | 'new'>('member')
  const [memberId, setMemberId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [mode, setMode] = useState<'one_off' | 'subscription'>('one_off')
  const [planId, setPlanId] = useState('')

  const [title, setTitle] = useState('')
  const [terms, setTerms] = useState(defaultTerms)
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([{ key: newKey(), kind: 'package', packageId: '', label: '', quantity: 1, unitAmountAed: 0 }])

  function setLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function pickPackage(key: string, packageId: string) {
    const pkg = packages.find((p) => p.id === packageId)
    setLine(key, { packageId, label: pkg?.name ?? '', unitAmountAed: pkg?.price_aed ?? 0 })
  }

  function submit() {
    setError(null)
    const buyer: QuoteBuyerInput =
      buyerKind === 'member' ? { athleteId: memberId }
      : buyerKind === 'lead' ? { leadId }
      : { newName, newEmail }
    start(async () => {
      const res = await createQuote({
        buyer, title, terms, validUntil: validUntil || null,
        mode,
        planId: mode === 'subscription' ? planId : null,
        lines: mode === 'subscription'
          ? []
          : lines.map(({ kind, packageId, label, quantity, unitAmountAed }) => ({ kind, packageId, label, quantity, unitAmountAed })),
      })
      if (res.error) setError(res.error)
      else if (res.quoteId) router.push(`/dashboard/quotes/${res.quoteId}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Buyer */}
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-ink">Who is this for?</label>
        <select className={inputClass} value={buyerKind} onChange={(e) => setBuyerKind(e.target.value as 'member' | 'lead' | 'new')}>
          <option value="member">Existing member</option>
          <option value="lead">Existing lead</option>
          <option value="new">New prospect</option>
        </select>
        {buyerKind === 'member' && (
          <select className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Select a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>)}
          </select>
        )}
        {buyerKind === 'lead' && (
          <select className={inputClass} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Select a lead…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name} — {l.email}</option>)}
          </select>
        )}
        {buyerKind === 'new' && (
          <div className="flex gap-2">
            <input className={inputClass} placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className={inputClass} placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
        )}
      </div>

      <input className={inputClass} placeholder="Quote title (e.g. Ramadan PT Bundle)" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-ink">What are you selling?</label>
        <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as 'one_off' | 'subscription')}>
          <option value="one_off">One-off (packages / fees)</option>
          <option value="subscription">Monthly membership (subscription)</option>
        </select>
      </div>

      {/* Lines */}
      {mode === 'one_off' && (
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-ink">Line items</label>
        {lines.map((l) => (
          <div key={l.key} className="flex flex-wrap items-center gap-2">
            <select className={`${inputClass} w-28`} value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value as QuoteLineInput['kind'] })}>
              <option value="package">Package</option>
              <option value="custom">Custom</option>
              <option value="discount">Discount</option>
            </select>
            {l.kind === 'package' ? (
              <select className={`${inputClass} flex-1`} value={l.packageId ?? ''} onChange={(e) => pickPackage(l.key, e.target.value)}>
                <option value="">Select a package…</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price_aed.toFixed(2)} AED</option>)}
              </select>
            ) : (
              <input className={`${inputClass} flex-1`} placeholder="Label" value={l.label} onChange={(e) => setLine(l.key, { label: e.target.value })} />
            )}
            <input className={`${inputClass} w-16`} type="number" min={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: parseInt(e.target.value) || 1 })} />
            <input className={`${inputClass} w-28`} type="number" step="0.01" placeholder="Amount (AED)" value={l.unitAmountAed || ''} onChange={(e) => setLine(l.key, { unitAmountAed: parseFloat(e.target.value) || 0 })} />
            <button type="button" className="text-xs text-danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</button>
          </div>
        ))}
        <button type="button" className="self-start text-xs text-accent-ink underline" onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: 'package', packageId: '', label: '', quantity: 1, unitAmountAed: 0 }])}>+ Add line</button>
      </div>
      )}

      {mode === 'subscription' && (
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-ink">Membership plan</label>
          <select className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Select a plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.monthly_price_aed.toFixed(2)} AED/month</option>)}
          </select>
          {plans.length === 0 && <p className="text-xs text-ink-3">No eligible plans. Create an active, non-trial plan with a Stripe price in Payments first.</p>}
        </div>
      )}

      <textarea className={`${inputClass} min-h-24`} placeholder="Terms (shown on the quote)" value={terms} onChange={(e) => setTerms(e.target.value)} />
      <div className="flex flex-col gap-1">
        <label className="text-[13px] text-ink-3">Valid until (optional)</label>
        <input className={inputClass} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button size="sm" className="self-start" disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Save draft'}</Button>
    </div>
  )
}
