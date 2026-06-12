'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [debugInfo, setDebugInfo] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const supabase = createClient()
    const params = new URLSearchParams(window.location.search)
    const code       = params.get('code')
    const tokenHash  = params.get('token_hash')
    const type       = params.get('type')
    const next       = params.get('next') ?? '/dashboard'
    const errorParam = params.get('error_description') ?? params.get('error')

    const allParams = Object.fromEntries(params.entries())
    setDebugInfo(JSON.stringify(allParams, null, 2))

    if (errorParam) {
      setStatus('error')
      setErrorMsg(errorParam)
      return
    }

    if (code) {
      setDebugInfo(prev => prev + '\n\n→ Using PKCE code exchange')
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          setStatus('error')
          setErrorMsg(error.message)
        } else {
          setDebugInfo(prev => prev + `\n→ Exchange OK, user: ${data.user?.email}`)
          setStatus('success')
          setTimeout(() => { window.location.href = next }, 1000)
        }
      })
      return
    }

    if (tokenHash && type) {
      setDebugInfo(prev => prev + '\n\n→ Using OTP token_hash verification')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any }).then(({ data, error }) => {
        if (error) {
          setStatus('error')
          setErrorMsg(error.message)
        } else {
          setDebugInfo(prev => prev + `\n→ OTP OK, user: ${data.user?.email}`)
          setStatus('success')
          setTimeout(() => { window.location.href = next }, 1000)
        }
      })
      return
    }

    setStatus('error')
    setErrorMsg('No code or token_hash in URL. URL params: ' + window.location.search)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[480px]">
        {status === 'processing' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-center text-sm text-ink-3">Signing you in…</p>
          </>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="mb-3 text-[32px]">✓</div>
            <p className="text-[15px] font-semibold text-ink">Signed in! Redirecting…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-danger bg-surface p-5">
            <p className="mb-2 font-semibold text-danger">Auth Error</p>
            <p className="mb-4 text-[13px] text-ink">{errorMsg}</p>
            <p className="mb-2 text-[11px] text-ink-3">Debug info (share with developer):</p>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-canvas p-3 text-[11px] text-ink-2">{debugInfo}</pre>
            <Link href="/" className="mt-4 block text-center text-[13px] text-accent-ink transition-colors hover:text-ink">
              ← Back to login
            </Link>
          </div>
        )}

        {status === 'processing' && debugInfo && (
          <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-[11px] text-ink-3">{debugInfo}</pre>
        )}
      </div>
    </div>
  )
}
