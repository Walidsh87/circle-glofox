'use client'

import { useState, useTransition } from 'react'
import { computeProration } from '@/lib/proration'
import { changePlan } from '@/app/dashboard/payments/_actions/change-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null }

const sel: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }
const btn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

export function ChangePlan({ membershipId, currentMonthly, anchor, today, plans }: {
  membershipId: string
  currentMonthly: number | null
  anchor: string
  today: string
  plans: Plan[]
}) {
  const [planId, setPlanId] = useState('')
  const [pending, start] = useTransition()
  if (plans.length === 0) return null

  const picked = plans.find((p) => p.id === planId)
  const pro = picked ? computeProration(currentMonthly ?? 0, picked.monthly_price_aed ?? 0, anchor, today) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={sel}>
          <option value="">Change plan to…</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthly_price_aed != null ? ` · ${p.monthly_price_aed} AED` : ''}</option>)}
        </select>
        {picked && (
          <button style={btn} disabled={pending} onClick={() => start(async () => { const r = await changePlan(membershipId, planId); if (r.error) alert(r.error) })}>
            Confirm change
          </button>
        )}
      </div>
      {pro && (
        <div style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>
          {pro.netAed > 0
            ? <>Member <strong style={{ color: 'var(--c-danger)' }}>owes {pro.netAed} AED</strong> now</>
            : pro.netAed < 0
              ? <>Credit <strong style={{ color: 'var(--c-ok-ink)' }}>{-pro.netAed} AED</strong> to the member</>
              : <>No prorated charge</>}
          <span style={{ color: 'var(--c-ink-muted)' }}> · credit {pro.creditAed} · charge {pro.chargeAed} ({pro.unusedDays}/{pro.cycleDays}d left in cycle)</span>
        </div>
      )}
    </div>
  )
}
