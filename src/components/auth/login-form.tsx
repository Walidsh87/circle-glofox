'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

export function LoginForm({
  redirectTo,
  newUserHint,
}: {
  redirectTo: string
  newUserHint: React.ReactNode
}) {
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Everyday sign-in. The code rail below covers first access, forgot-password
  // and self-signup — no magic links; the typed 6-digit code is the mechanism.
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setError(error.message)
    } else {
      window.location.href = redirectTo
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    // shouldCreateUser stays true: self-signup rides this rail (owner → /onboarding, athlete → /join).
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setLoading(false)
    if (error) setError(error.message)
    else setCodeSent(true)
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    if (error) {
      setLoading(false)
      setError(error.message)
    } else {
      window.location.href = redirectTo
    }
  }

  function switchMode(next: 'password' | 'code') {
    setMode(next)
    setCodeSent(false)
    setCode('')
    setPassword('')
    setError(null)
  }

  return (
    <div className="c-stage-in">
      <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
        Sign in
      </div>
      <h1 className="mb-2 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
        The best hour
        <br />
        of your day.
      </h1>
      <p className="mb-8 text-sm text-ink-2">
        {mode === 'password' ? (
          'Sign in with your email and password.'
        ) : codeSent ? (
          <>
            We sent a 6-digit code to{' '}
            <span className="font-mono font-semibold text-ink">{email}</span>.
          </>
        ) : (
          "Enter your email and we'll send a 6-digit sign-in code."
        )}
      </p>

      {mode === 'password' && (
        <form onSubmit={handleSignIn} className="flex flex-col gap-3.5">
          <Field
            label="Email"
            type="email"
            required
            disabled={loading}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            disabled={loading}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in →'}
          </Button>
        </form>
      )}

      {mode === 'code' && !codeSent && (
        <form onSubmit={handleSendCode} className="flex flex-col gap-3.5">
          <Field
            label="Email"
            type="email"
            required
            disabled={loading}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Sending…' : 'Send code →'}
          </Button>
        </form>
      )}

      {mode === 'code' && codeSent && (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3.5">
          <Field
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={loading}
            placeholder="123456"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-14 text-center font-mono text-2xl tracking-[0.2em]"
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
            {loading ? 'Verifying…' : 'Sign in →'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => {
              setCodeSent(false)
              setCode('')
              setError(null)
            }}
          >
            ← Use a different email
          </Button>
        </form>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={() => switchMode(mode === 'password' ? 'code' : 'password')}
        className="mt-4 text-sm font-semibold text-ink underline underline-offset-4 transition-colors hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      >
        {mode === 'password' ? 'Sign in with a code instead' : 'Use a password instead'}
      </button>

      {newUserHint && <p className="mt-5 text-xs text-ink-2">{newUserHint}</p>}
    </div>
  )
}
