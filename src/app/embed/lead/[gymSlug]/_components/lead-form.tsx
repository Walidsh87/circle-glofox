'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { submitLead } from '../_actions/submit-lead'

const inputClass =
  'w-full rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

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

  if (done) {
    return (
      <div className="px-1 py-5 text-center">
        <div className="text-base font-semibold text-ink">Thanks — we’ll be in touch!</div>
        <p className="mt-1.5 text-sm text-ink-3">The team will reach out shortly.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <input className={inputClass} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={inputClass} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <textarea className={cn(inputClass, 'min-h-[90px] resize-y')} placeholder="What are you interested in? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      {/* honeypot: hidden from humans, tempting to bots */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <button
        onClick={onSubmit}
        disabled={pending}
        className="rounded-[10px] bg-accent px-[18px] py-3 text-[15px] font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Get in touch'}
      </button>
    </div>
  )
}
