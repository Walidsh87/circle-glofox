'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/hooks/use-copy'
import { loadMemberContext } from '../_actions/load-member-context'
import { loadActivePackages, type PackageOption } from '../_actions/load-active-packages'
import { deskRecordCash, deskPaymentLink, deskSellPackage } from '../_actions/desk-money'

type Membership = NonNullable<Awaited<ReturnType<typeof loadMemberContext>>['ctx']>['membership']

export function PaymentActions({ athleteId }: { athleteId: string }) {
  const [membership, setMembership] = useState<Membership>(null)
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cashDone, setCashDone] = useState(false)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [linkQr, setLinkQr] = useState<string | null>(null)
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const { copy } = useCopy()

  useEffect(() => {
    Promise.all([loadMemberContext(athleteId), loadActivePackages()]).then(([ctx, pkgs]) => {
      setMembership(ctx.ctx?.membership ?? null)
      setPackages(pkgs.packages ?? [])
      setLoading(false)
    })
  }, [athleteId])

  async function handleCash() {
    if (!membership) return
    setBusy(true)
    setError(null)
    const res = await deskRecordCash(membership.id)
    setBusy(false)
    if (res.error) {
      setError(res.error)
    } else {
      setCashDone(true)
    }
  }

  async function handlePaymentLink() {
    if (!membership) return
    setBusy(true)
    setError(null)
    const res = await deskPaymentLink(membership.id)
    setBusy(false)
    if (res.error || !res.url) {
      setError(res.error ?? 'Could not create payment link.')
      return
    }
    setLinkUrl(res.url)
    const dataUrl = await QRCode.toDataURL(res.url, { width: 220, margin: 1 })
    setLinkQr(dataUrl)
  }

  async function handleSellPack() {
    if (!selectedPackageId) return
    setBusy(true)
    setError(null)
    const res = await deskSellPackage(selectedPackageId, athleteId)
    setBusy(false)
    if (res.error || !res.url) {
      setError(res.error ?? 'Could not create pack link.')
      return
    }
    setLinkUrl(res.url)
    const dataUrl = await QRCode.toDataURL(res.url, { width: 220, margin: 1 })
    setLinkQr(dataUrl)
  }

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-[13px] text-ink-3">Loading…</p>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Take payment</h2>

      {membership ? (
        <div className="mb-4 space-y-2">
          <p className="text-[13px] text-ink-2">
            {membership.plan_name}
            {membership.monthly_price_aed != null ? ` · AED ${membership.monthly_price_aed}` : ''}
            {' '}
            <span className={membership.payment_status === 'paid' ? 'text-accent-ink' : 'text-danger'}>
              ({membership.payment_status})
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {cashDone ? (
              <span className="text-[13px] text-accent-ink">✓ Marked paid (cash)</span>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={handleCash}>
                Record cash
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={handlePaymentLink}>
              Payment link
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-ink-2">
          No membership on file — sign them up first or sell a pack.
        </p>
      )}

      <div className="border-t border-line pt-3">
        <p className="mb-2 text-[12px] font-medium text-ink-3">Sell a pack</p>
        {packages.length === 0 ? (
          <p className="text-[13px] text-ink-3">No active packages.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedPackageId}
              onChange={(e) => setSelectedPackageId(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              disabled={busy}
            >
              <option value="">Select a package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · AED {p.price_aed}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={busy || !selectedPackageId} onClick={handleSellPack}>
              Generate pack link
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

      {linkUrl && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={linkUrl}
              className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(linkUrl)}
            >
              Copy
            </Button>
          </div>
          {linkQr && (
            <div className="w-fit rounded bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={linkQr} alt="Payment QR" width={180} height={180} className="block" />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
