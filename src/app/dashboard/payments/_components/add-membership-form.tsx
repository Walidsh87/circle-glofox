'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveMembership } from '../_actions/save-membership'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'Adding...' : 'Add membership'}</Button>
}

type Athlete = { id: string; full_name: string }
type Plan = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null }

const cls = 'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function AddMembershipForm({ athletes, stripeConnected, plans }: { athletes: Athlete[]; stripeConnected: boolean; plans: Plan[] }) {
  const [state, formAction] = useFormState(saveMembership, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  const [planId, setPlanId] = useState('')
  const [planName, setPlanName] = useState('')
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [stripePriceId, setStripePriceId] = useState('')

  useEffect(() => {
    if (!state.error && formRef.current) {
      formRef.current.reset()
      setPlanId(''); setPlanName(''); setMonthlyPrice(''); setStripePriceId('')
    }
  }, [state])

  function onPick(id: string) {
    setPlanId(id)
    const p = plans.find((x) => x.id === id)
    if (p) {
      setPlanName(p.name)
      setMonthlyPrice(p.monthly_price_aed != null ? String(p.monthly_price_aed) : '')
      setStripePriceId(p.provider_plan_ref ?? '')
    }
  }

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <input type="hidden" name="planId" value={planId} />
      <select name="athleteId" required className={cls}>
        <option value="">Select athlete</option>
        {athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
      </select>
      {plans.length > 0 && (
        <select value={planId} onChange={(e) => onPick(e.target.value)} className={cls}>
          <option value="">— Plan (or type below) —</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthly_price_aed != null ? ` · ${p.monthly_price_aed} AED` : ''}</option>)}
        </select>
      )}
      <input name="planName" type="text" required placeholder="Plan (e.g. Unlimited)" value={planName} onChange={(e) => setPlanName(e.target.value)} className={cls} />
      <input name="monthlyPrice" type="number" min={0} step={0.01} placeholder="Price (AED)" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} className={cls} />
      <input name="startDate" type="date" required defaultValue={today} className={cls} />
      {stripeConnected && (
        <input name="stripePriceId" type="text" placeholder="Stripe Price ID (optional, e.g. price_...)" value={stripePriceId} onChange={(e) => setStripePriceId(e.target.value)} className={`col-span-2 sm:col-span-4 font-mono ${cls}`} />
      )}
      <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
        <SubmitButton />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  )
}
