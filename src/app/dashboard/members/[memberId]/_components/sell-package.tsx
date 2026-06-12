'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sellPackage } from '../_actions/sell-package'
import { redeemSession } from '../_actions/redeem-session'

type Pkg = { id: string; name: string; type: string; credit_count: number; price_aed: number }
type Credit = { id: string; kind: string; credits_remaining: number; credits_total: number; expires_at: string | null; packages: { name: string } | { name: string }[] | null }

const TYPE_LABEL: Record<string, string> = { class_pack: 'Class pack', drop_in: 'Drop-in', pt_block: 'PT block' }

const selClass =
  'rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function pkgName(c: Credit): string {
  const p = c.packages
  return Array.isArray(p) ? (p[0]?.name ?? 'Package') : (p?.name ?? 'Package')
}

export function SellPackage({ athleteId, packages, credits, coaches }: { athleteId: string; packages: Pkg[]; credits: Credit[]; coaches: { id: string; full_name: string | null }[] }) {
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Separate transition so redeeming doesn't disable the unrelated sell button.
  const [, startRedeemTransition] = useTransition()
  const [redeeming, setRedeeming] = useState<string | null>(null)
  // Payroll (#55): every redeemed PT session is attributed to the delivering coach.
  const [ptCoachId, setPtCoachId] = useState(coaches[0]?.id ?? '')

  function onRedeem(creditId: string) {
    setRedeeming(creditId)
    startRedeemTransition(async () => {
      const res = await redeemSession(creditId, ptCoachId)
      if (res.error) alert(res.error)
      setRedeeming(null)
    })
  }

  const hasPtCredit = credits.some((c) => c.kind === 'pt_session')

  function onSell() {
    setUrl(null); setError(null)
    startTransition(async () => {
      const res = await sellPackage(packageId, athleteId)
      if (res.error) setError(res.error)
      else setUrl(res.url)
    })
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-[13px] font-semibold text-ink">Packages &amp; credits</p>

      {hasPtCredit && (
        <div className="mb-2.5 flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">PT coach</span>
          {coaches.length === 0 ? (
            <span className="text-xs text-ink-3">Add a coach to attribute PT sessions</span>
          ) : (
            <select
              value={ptCoachId}
              onChange={(e) => setPtCoachId(e.target.value)}
              aria-label="Coach who delivered the PT session"
              className={cn(selClass, 'text-xs')}
            >
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name ?? 'Coach'}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {credits.length > 0 ? (
        <div className="mb-4 flex flex-col gap-1.5">
          {credits.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2.5 text-[13px] text-ink-2">
              <span>
                {pkgName(c)} <span className="font-mono text-ink-3">({c.kind === 'pt_session' ? 'PT' : 'class'})</span>
              </span>
              <span className="flex items-center gap-2.5">
                <span className="font-mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
                {c.kind === 'pt_session' && c.credits_remaining > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => onRedeem(c.id)}
                    disabled={redeeming === c.id || !ptCoachId}
                    title={!ptCoachId ? 'Add a coach to attribute PT sessions' : undefined}
                  >
                    {redeeming === c.id ? 'Redeeming…' : 'Redeem session'}
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-xs text-ink-3">No credits yet.</p>
      )}

      {packages.length === 0 ? (
        <p className="text-xs text-ink-3">No active packages. Create one under <strong>Packages</strong>.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={selClass}>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {TYPE_LABEL[p.type] ?? p.type} · {Number(p.price_aed).toFixed(2)} AED</option>
            ))}
          </select>
          <Button size="sm" onClick={onSell} disabled={pending || !packageId}>
            {pending ? 'Creating…' : 'Generate payment link'}
          </Button>
        </div>
      )}

      {error && <p role="alert" className="mt-2.5 text-xs text-danger">{error}</p>}
      {url && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-ink-2">Send this payment link to the member:</p>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
      )}
    </Card>
  )
}
