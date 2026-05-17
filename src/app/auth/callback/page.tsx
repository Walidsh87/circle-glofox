'use client'

import { useEffect, useState } from 'react'
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
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)',
      padding: 24,
    }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        {status === 'processing' && (
          <>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '2px solid var(--circle-lime)', borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite', margin: '0 auto 16px',
            }} />
            <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, textAlign: 'center' }}>Signing you in…</p>
          </>
        )}

        {status === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <p style={{ color: 'var(--c-ink)', fontSize: 15, fontWeight: 600 }}>Signed in! Redirecting…</p>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            background: 'var(--c-surface)', border: '1px solid var(--c-danger)',
            borderRadius: 12, padding: 20,
          }}>
            <p style={{ color: 'var(--c-danger)', fontWeight: 600, marginBottom: 8 }}>Auth Error</p>
            <p style={{ color: 'var(--c-ink)', fontSize: 13, marginBottom: 16 }}>{errorMsg}</p>
            <p style={{ color: 'var(--c-ink-muted)', fontSize: 11, marginBottom: 8 }}>Debug info (share with developer):</p>
            <pre style={{
              background: 'var(--c-surface-sunk)', borderRadius: 8, padding: 12,
              fontSize: 11, color: 'var(--c-ink-2)', overflow: 'auto', whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>{debugInfo}</pre>
            <a href="/" style={{
              display: 'block', marginTop: 16, textAlign: 'center',
              color: 'var(--circle-lime-ink)', fontSize: 13, textDecoration: 'none',
            }}>← Back to login</a>
          </div>
        )}

        {status === 'processing' && debugInfo && (
          <pre style={{
            marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 8, padding: 12, fontSize: 11, color: 'var(--c-ink-muted)',
            overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>{debugInfo}</pre>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
