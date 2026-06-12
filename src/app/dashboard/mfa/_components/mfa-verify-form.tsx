'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function MfaVerifyForm() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [noFactor, setNoFactor] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.find((f) => f.status === 'verified')
      if (verified) setFactorId(verified.id)
      else setNoFactor(true)
    })
  }, [])

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId || code.length !== 6) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    // Fresh challenge per attempt — challenges expire quickly.
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
    if (chErr || !ch) {
      setError(chErr?.message ?? 'Could not start the check. Try again.')
      setBusy(false)
      return
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code })
    if (vErr) {
      setError('Wrong code — try again.')
      setBusy(false)
      setCode('')
      return
    }
    window.location.href = '/dashboard'
  }

  async function onSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (noFactor) {
    return (
      <div className="text-sm text-ink-2">
        No authenticator is set up for this account anymore.{' '}
        <a href="/dashboard" className="font-semibold text-ink underline">Continue to dashboard →</a>
      </div>
    )
  }

  return (
    <form onSubmit={onVerify} className="flex flex-col items-center gap-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        aria-label="6-digit code"
        className="h-12 w-40 rounded-lg border border-line-strong bg-surface text-center font-mono text-xl tracking-[0.3em] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent"
      />
      <Button type="submit" disabled={busy || code.length !== 6 || !factorId} className="w-40">
        {busy ? 'Checking…' : 'Verify'}
      </Button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <button type="button" onClick={onSignOut} className="mt-2 text-xs text-ink-3 transition-colors hover:text-ink">
        Wrong account? Sign out
      </button>
    </form>
  )
}
