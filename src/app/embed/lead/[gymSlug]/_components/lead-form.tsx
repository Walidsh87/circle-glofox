'use client'

import { useState, useTransition } from 'react'
import { submitLead } from '../_actions/submit-lead'

export function LeadForm({ gymSlug, refCode }: { gymSlug: string; refCode?: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function onSubmit() {
    setError(null)
    start(async () => {
      const res = await submitLead(gymSlug, { name, email, phone, message, company, ref: refCode })
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      setDone(true)
    })
  }

  const input = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 15, color: 'var(--c-ink)', fontFamily: 'inherit' } as const

  if (done) {
    return (
      <div style={{ padding: '20px 4px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-ink)' }}>Thanks — we’ll be in touch!</div>
        <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginTop: 6 }}>The team will reach out shortly.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input style={input} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="What are you interested in? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      {/* honeypot: hidden from humans, tempting to bots */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}
      <button onClick={onSubmit} disabled={pending} style={{ padding: '12px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? 'Sending…' : 'Get in touch'}
      </button>
    </div>
  )
}
