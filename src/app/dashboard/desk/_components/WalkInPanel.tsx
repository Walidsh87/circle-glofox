'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { loadActivePlans, type PlanOption } from '../_actions/load-active-plans'
import { deskCreateLead } from '../_actions/desk-create-lead'
import { deskSignUp } from '../_actions/desk-sign-up'
import { PaymentActions } from './PaymentActions'

const inputClass =
  'h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function WalkInPanel({
  initialName,
  leadId,
  onDone,
}: {
  initialName?: string
  leadId?: string
  onDone?: () => void
}) {
  const [mode, setMode] = useState<'lead' | 'signup'>(leadId ? 'signup' : 'lead')
  const [fullName, setFullName] = useState(initialName ?? '')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [planId, setPlanId] = useState('')
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMemberId, setDoneMemberId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => {
    loadActivePlans().then((res) => {
      setPlans(res.plans ?? [])
    })
  }, [])

  const canSubmit =
    fullName.trim().length > 0 && (mode === 'lead' || planId !== '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'lead') {
        const res = await deskCreateLead({ fullName, phone, email, source: 'walk_in' })
        if (res.error) { setError(res.error); return }
        onDone?.()
      } else {
        const plan = plans.find((p) => p.id === planId)
        if (!plan) { setError('Please select a plan.'); return }
        const res = await deskSignUp({
          leadId,
          fullName,
          email,
          phone,
          source: 'walk_in',
          planId: plan.id,
          planName: plan.name,
          monthlyPrice: plan.monthly_price_aed ?? undefined,
          stripePriceId: plan.provider_plan_ref ?? undefined,
        })
        if (res.error) { setError(res.error); return }
        setDoneMemberId(res.memberId ?? null)
      }
    } finally {
      setBusy(false)
    }
  }

  // Success state after signup
  if (doneMemberId !== null) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold text-ink">
          {fullName} is signed up.
        </p>
        {showPayment ? (
          <PaymentActions athleteId={doneMemberId} />
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowPayment(true)}>
              Take payment
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDone?.()}>
              Done
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="p-4 space-y-4">
      {/* Mode tabs — hide "Save as lead" when a leadId is present */}
      {!leadId && (
        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1 text-[13px]">
          <button
            type="button"
            onClick={() => setMode('lead')}
            className={`flex-1 rounded-md px-3 py-1 font-medium transition-colors ${
              mode === 'lead'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            Save as lead
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-md px-3 py-1 font-medium transition-colors ${
              mode === 'signup'
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            Sign up now
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-ink-2">
            Full name
          </label>
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium text-ink-2">
            Phone
          </label>
          <input
            type="tel"
            placeholder="+971 50 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium text-ink-2">
            Email
          </label>
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        {mode === 'signup' && (
          <div>
            <label className="mb-1 block text-[12px] font-medium text-ink-2">
              Plan
            </label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Select a plan&hellip;</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.is_trial
                    ? ' · trial'
                    : plan.monthly_price_aed
                    ? ` · AED ${plan.monthly_price_aed}`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="sm" disabled={busy || !canSubmit} className="w-full">
          {busy
            ? mode === 'lead'
              ? 'Saving…'
              : 'Signing up…'
            : mode === 'lead'
            ? 'Save lead'
            : 'Sign up'}
        </Button>
      </form>
    </Card>
  )
}
