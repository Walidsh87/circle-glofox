'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CircleMark } from '@/components/circle-mark'

type Step = 'email' | 'code'

export function GymLoginForm({ gymName, gymSlug }: { gymName: string; gymSlug: string }) {
  const [step, setStep]       = useState<Step>('email')
  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ email })
    setLoading(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setLoading(false)
    if (error) setError(error.message)
    else window.location.href = `/join/${gymSlug}`
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      minHeight: '100vh', fontFamily: 'var(--font-geist-sans)',
    }}>
      {/* Left — form */}
      <section style={{
        padding: '56px 64px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: 'var(--c-surface)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontFamily: 'var(--font-space-grotesk)', fontWeight: 700,
          fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--c-ink)',
        }}>
          <CircleMark size={24} />
          <span>Circle</span>
        </div>

        <div style={{ maxWidth: 380, width: '100%' }}>
          {step === 'email' ? (
            <div className="c-stage-in">
              <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Sign in</div>
              <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.025em', marginBottom: 8, color: 'var(--c-ink)' }}>
                The best hour<br />of your day.
              </h1>
              <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, marginBottom: 32 }}>
                Enter your email and we&apos;ll send a 6-digit sign-in code.
              </p>

              <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Email</div>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%', height: 46, padding: '0 14px',
                      border: '1.5px solid var(--c-border-strong)', borderRadius: 10,
                      background: 'var(--c-surface)', fontSize: 15, color: 'var(--c-ink)',
                      fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--circle-lime)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--c-border-strong)')}
                  />
                </label>
                {error && <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    height: 46, background: 'var(--circle-lime)',
                    border: 'none', borderRadius: 10,
                    fontSize: 14.5, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                    color: 'var(--circle-ink)', letterSpacing: '0.01em',
                    opacity: loading ? 0.7 : 1, transition: 'opacity .12s',
                  }}
                >
                  {loading ? 'Sending…' : 'Send code →'}
                </button>
              </form>

              <p style={{ marginTop: 22, fontSize: 12, color: 'var(--c-ink-muted)' }}>
                New to {gymName}?{' '}
                <span style={{ color: 'var(--c-ink)', fontWeight: 600 }}>Enter your email above to create a free account.</span>
              </p>
            </div>
          ) : (
            <div className="c-stage-in">
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'var(--circle-lime-soft)',
                border: '1px solid var(--circle-lime)',
                display: 'grid', placeItems: 'center', marginBottom: 22,
              }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--circle-lime-ink)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                </svg>
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>Check your inbox</div>
              <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 32, letterSpacing: '-0.025em', marginBottom: 12, color: 'var(--c-ink)' }}>
                Enter your code.
              </h1>
              <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, marginBottom: 24 }}>
                We sent a 6-digit code to{' '}
                <span className="mono" style={{ color: 'var(--c-ink)', fontWeight: 600 }}>{email}</span>.
              </p>

              <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>6-digit code</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{
                      width: '100%', height: 54, padding: '0 14px',
                      border: '1.5px solid var(--c-border-strong)', borderRadius: 10,
                      background: 'var(--c-surface)', fontSize: 28, color: 'var(--c-ink)',
                      fontFamily: 'var(--font-geist-mono)', outline: 'none',
                      letterSpacing: '0.2em', textAlign: 'center', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--circle-lime)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--c-border-strong)')}
                    autoFocus
                  />
                </label>
                {error && <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  style={{
                    height: 46, background: 'var(--circle-lime)',
                    border: 'none', borderRadius: 10,
                    fontSize: 14.5, fontWeight: 700,
                    cursor: (loading || code.length !== 6) ? 'not-allowed' : 'pointer',
                    color: 'var(--circle-ink)', letterSpacing: '0.01em',
                    opacity: (loading || code.length !== 6) ? 0.6 : 1, transition: 'opacity .12s',
                  }}
                >
                  {loading ? 'Verifying…' : 'Sign in →'}
                </button>
              </form>

              <button
                onClick={() => { setStep('email'); setCode(''); setError(null) }}
                style={{
                  marginTop: 14, background: 'none',
                  border: '1px solid var(--c-border)', borderRadius: 8,
                  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                  color: 'var(--c-ink-2)', width: '100%',
                }}
              >← Use a different email</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
          <div className="mono">© Circle · GCC</div>
          <div style={{ display: 'flex', gap: 14 }}>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </section>

      {/* Right — gym panel */}
      <aside style={{
        background: 'var(--circle-ink)', color: '#fafafa',
        position: 'relative', overflow: 'hidden',
        padding: 48, display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        <div style={{ position: 'absolute', right: -160, top: -160, width: 520, height: 520, borderRadius: '50%', border: '2px solid var(--circle-lime)', opacity: 0.35 }} />
        <div style={{ position: 'absolute', right: -80, bottom: -180, width: 360, height: 360, borderRadius: '50%', border: '2px solid var(--circle-lime)', opacity: 0.2 }} />
        <div style={{ position: 'absolute', right: 80, top: 80, transform: 'rotate(20deg)', width: 6, height: 380, background: '#B0B0B0', opacity: 0.25 }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="mono" style={{ fontSize: 11, color: 'rgba(250,250,250,0.55)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Member Portal</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>GCC</div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{
            fontFamily: 'var(--font-space-grotesk)', fontSize: 64, fontWeight: 700,
            letterSpacing: '-0.04em', lineHeight: 0.95, color: 'var(--circle-lime)',
            wordBreak: 'break-word',
          }}>
            {gymName}
          </div>
          <div style={{ width: 36, height: 1.5, background: 'var(--circle-lime)', margin: '24px 0' }} />
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', maxWidth: 360, lineHeight: 1.4, color: '#fafafa' }}>
            Book classes, track your WODs, and manage your membership — all in one place.
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', gap: 18, alignItems: 'center', fontSize: 12, color: 'rgba(250,250,250,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="c-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--circle-lime)', flexShrink: 0 }} />
            <span className="mono" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live platform</span>
          </div>
          <div style={{ width: 1, height: 14, background: '#333' }} />
          <span className="mono">Powered by Circle</span>
        </div>
      </aside>
    </div>
  )
}
