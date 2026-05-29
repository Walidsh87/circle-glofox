'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { updateSettings } from '../_actions/update-settings'

const TIMEZONES = [
  { value: 'Asia/Dubai',   label: 'Dubai (GST +4)' },
  { value: 'Asia/Riyadh',  label: 'Riyadh (AST +3)' },
  { value: 'Asia/Qatar',   label: 'Qatar (AST +3)' },
  { value: 'Asia/Kuwait',  label: 'Kuwait (AST +3)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST +3)' },
  { value: 'Asia/Muscat',  label: 'Muscat (GST +4)' },
]

const RESERVED_SLUGS = ['dashboard', 'onboarding', 'auth', 'api', 'login', 'signup', 'admin', 'settings', 'join']

function toSlug(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 14px',
  border: '1.5px solid var(--c-border-strong)', borderRadius: 10,
  background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{hint}</div>}
    </div>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 42, padding: '0 24px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 10,
        fontSize: 14, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        transition: 'opacity .12s',
      }}
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  )
}

type Props = {
  initialName: string
  initialSlug: string
  initialTimezone: string
  initialTrn: string
  initialLegalName: string
  initialBillingAddress: string
  stripeConnected: boolean
}

export function SettingsForm({ initialName, initialSlug, initialTimezone, initialTrn, initialLegalName, initialBillingAddress, stripeConnected }: Props) {
  const [gymName, setGymName] = useState(initialName)
  const [slug, setSlug] = useState(initialSlug)
  const [slugEdited, setSlugEdited] = useState(!!initialSlug)
  const [timezone, setTimezone] = useState(initialTimezone)
  const [trn, setTrn] = useState(initialTrn)
  const [legalName, setLegalName] = useState(initialLegalName)
  const [billingAddress, setBillingAddress] = useState(initialBillingAddress)
  const [state, formAction] = useFormState(updateSettings, { error: null, success: false })

  function handleGymNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setGymName(name)
    if (!slugEdited) setSlug(toSlug(name))
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true)
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))
  }

  const slugValid = /^[a-z0-9-]{3,40}$/.test(slug) && !RESERVED_SLUGS.includes(slug)

  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 14, padding: '22px 24px', boxShadow: 'var(--c-shadow-sm)',
    }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 20 }}>Gym details</p>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field id="gymName" label="Gym name">
          <input
            id="gymName" name="gymName" type="text" required
            value={gymName} onChange={handleGymNameChange} style={inputStyle}
          />
        </Field>

        <Field id="slug" label="Gym URL" hint="Members use this link to log in. Changing it breaks existing links.">
          <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${slugValid || !slug ? 'var(--c-border-strong)' : 'var(--c-danger)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--c-surface)', height: 42 }}>
            <span className="mono" style={{
              padding: '0 10px', fontSize: 12, color: 'var(--c-ink-muted)',
              background: 'var(--c-surface-sunk)', borderRight: '1px solid var(--c-border)',
              height: '100%', display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              circle.app/
            </span>
            <input
              id="slug" name="slug" type="text" required
              value={slug} onChange={handleSlugChange}
              style={{ flex: 1, height: '100%', padding: '0 12px', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--c-ink)', fontFamily: 'var(--font-geist-mono)', boxSizing: 'border-box' }}
            />
          </div>
        </Field>

        <Field id="timezone" label="Timezone">
          <select id="timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>

        <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 18, marginTop: 4 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 16 }}>VAT invoicing (UAE)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            <Field id="legalName" label="Legal entity name" hint="Appears on the invoice. Defaults to gym name if blank.">
              <input id="legalName" name="legalName" type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} style={inputStyle} />
            </Field>
            <Field id="trn" label="TRN" hint="15-digit UAE Tax Registration Number. Required for VAT-compliant invoices.">
              <input
                id="trn" name="trn" type="text" inputMode="numeric"
                value={trn}
                onChange={(e) => setTrn(e.target.value.replace(/\D/g, '').slice(0, 15))}
                placeholder="100123456700003"
                style={inputStyle}
              />
            </Field>
            <Field id="billingAddress" label="Billing address" hint="Shown on invoice header.">
              <textarea
                id="billingAddress" name="billingAddress" rows={3}
                value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}
                style={{ ...inputStyle, height: 'auto', padding: 12, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </Field>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 18, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', margin: 0 }}>Stripe payments</p>
            {stripeConnected && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>
                Connected
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field id="stripeSecretKey" label="Secret key" hint="Starts with sk_live_ or sk_test_. Leave blank to keep existing.">
              <input
                id="stripeSecretKey" name="stripeSecretKey" type="password"
                placeholder={stripeConnected ? 'sk_••••••••••••••••' : 'sk_live_...'}
                style={inputStyle}
              />
            </Field>
            <Field id="stripeWebhookSecret" label="Webhook secret" hint="From Stripe dashboard → Webhooks. Starts with whsec_. Leave blank to keep existing.">
              <input
                id="stripeWebhookSecret" name="stripeWebhookSecret" type="password"
                placeholder={stripeConnected ? 'whsec_••••••••••••••••' : 'whsec_...'}
                style={inputStyle}
              />
            </Field>
          </div>
        </div>

        {state.error && <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>}
        {state.success && <p style={{ fontSize: 13, color: 'var(--c-ok)', margin: 0 }}>Settings saved.</p>}

        <div><SaveButton /></div>
      </form>
    </div>
  )
}
