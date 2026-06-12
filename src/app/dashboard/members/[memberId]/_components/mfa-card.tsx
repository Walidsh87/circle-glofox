'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type VerifiedFactor = { id: string; created_at: string }
type Enrolling = { factorId: string; qr: string; secret: string }

const codeInputClass =
  'h-10 w-40 rounded-lg border border-line bg-surface px-3 text-center font-mono text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function MfaCard() {
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState<VerifiedFactor | null>(null)
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(async ({ data }) => {
      // data.totp holds only VERIFIED factors; abandoned half-enrollments live
      // in data.all and block re-enrolling — clear them quietly.
      const abandoned = (data?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'unverified')
      for (const f of abandoned) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const v = data?.totp?.[0]
      setVerified(v ? { id: v.id, created_at: v.created_at } : null)
      setLoading(false)
    })
  }, [])

  async function onEnable() {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })
    if (error || !data) {
      setBusy(false)
      setError(error?.message ?? 'Could not start enrollment.')
      return
    }
    const qr = await QRCode.toDataURL(data.totp.uri, { width: 320, margin: 1 })
    setBusy(false)
    setEnrolling({ factorId: data.id, qr, secret: data.totp.secret })
  }

  async function onActivate(e: React.FormEvent) {
    e.preventDefault()
    if (!enrolling || code.length !== 6) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId })
    if (chErr || !ch) {
      setError(chErr?.message ?? 'Could not verify. Try again.')
      setBusy(false)
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enrolling.factorId, challengeId: ch.id, code })
    setBusy(false)
    if (vErr) {
      setError('Wrong code — scan again and retry.')
      setCode('')
      return
    }
    setVerified({ id: enrolling.factorId, created_at: new Date().toISOString() })
    setEnrolling(null)
    setCode('')
  }

  async function onDisable() {
    if (!verified) return
    if (!confirm('Turn off two-factor? Your password alone will sign you in.')) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setVerified(null)
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Two-factor authentication</h2>

      {loading ? (
        <p className="text-[13px] text-ink-3">Checking…</p>
      ) : verified ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-ink">On since {verified.created_at.slice(0, 10)} — every login needs your authenticator code.</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={onDisable}>Disable</Button>
        </div>
      ) : enrolling ? (
        <div>
          <p className="mb-3 text-[13px] text-ink-2">Scan with your authenticator app (Google Authenticator, 1Password, Authy…), then enter the first code.</p>
          <div className="mx-auto mb-2 w-fit rounded bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolling.qr} alt="Authenticator QR code" width={160} height={160} className="block" />
          </div>
          <p className="mb-3 break-all text-center font-mono text-[11px] text-ink-3">{enrolling.secret}</p>
          <form onSubmit={onActivate} className="flex items-center justify-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="6-digit code"
              className={codeInputClass}
            />
            <Button type="submit" size="sm" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Activate'}
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-ink-2">Add a 6-digit authenticator code to your login.</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={onEnable}>
            {busy ? '…' : 'Enable two-factor'}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </Card>
  )
}
