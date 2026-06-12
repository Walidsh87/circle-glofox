'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { cn } from '@/lib/utils'
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

const inputClass =
  'h-[42px] w-full rounded-[10px] border-[1.5px] border-line-strong bg-surface px-3.5 text-sm text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
        {label}
      </label>
      {children}
      {hint && <div className="text-[11.5px] text-ink-3">{hint}</div>}
    </div>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'h-[42px] rounded-[10px] px-6 text-sm font-bold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        pending ? 'cursor-not-allowed bg-surface-2 text-ink-3' : 'bg-accent text-accent-contrast hover:bg-accent-hover'
      )}
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
    <div className="rounded-[14px] border border-line bg-surface px-6 py-[22px] shadow-card">
      <p className="mb-5 text-sm font-semibold text-ink">Gym details</p>

      <form action={formAction} className="flex flex-col gap-[18px]">
        <Field id="gymName" label="Gym name">
          <input
            id="gymName" name="gymName" type="text" required
            value={gymName} onChange={handleGymNameChange} className={inputClass}
          />
        </Field>

        <Field id="slug" label="Gym URL" hint="Members use this link to log in. Changing it breaks existing links.">
          <div className={cn(
            'flex h-[42px] items-center overflow-hidden rounded-[10px] border-[1.5px] bg-surface',
            slugValid || !slug ? 'border-line-strong' : 'border-danger'
          )}>
            <span className="flex h-full shrink-0 items-center whitespace-nowrap border-r border-line bg-canvas px-2.5 font-mono text-xs text-ink-3">
              circle.app/
            </span>
            <input
              id="slug" name="slug" type="text" required
              value={slug} onChange={handleSlugChange}
              className="h-full flex-1 border-none bg-transparent px-3 font-mono text-sm text-ink outline-none"
            />
          </div>
        </Field>

        <Field id="timezone" label="Timezone">
          <select id="timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>

        <div className="mt-1 border-t border-line pt-[18px]">
          <p className="mb-4 text-sm font-semibold text-ink">VAT invoicing (UAE)</p>
          <div className="mb-[18px] flex flex-col gap-3.5">
            <Field id="legalName" label="Legal entity name" hint="Appears on the invoice. Defaults to gym name if blank.">
              <input id="legalName" name="legalName" type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputClass} />
            </Field>
            <Field id="trn" label="TRN" hint="15-digit UAE Tax Registration Number. Required for VAT-compliant invoices.">
              <input
                id="trn" name="trn" type="text" inputMode="numeric"
                value={trn}
                onChange={(e) => setTrn(e.target.value.replace(/\D/g, '').slice(0, 15))}
                placeholder="100123456700003"
                className={inputClass}
              />
            </Field>
            <Field id="billingAddress" label="Billing address" hint="Shown on invoice header.">
              <textarea
                id="billingAddress" name="billingAddress" rows={3}
                value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)}
                className={cn(inputClass, 'h-auto resize-y p-3')}
              />
            </Field>
          </div>
        </div>

        <div className="mt-1 border-t border-line pt-[18px]">
          <div className="mb-4 flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">Stripe payments</p>
            {stripeConnected && (
              <span className="rounded-full bg-ok-soft px-[7px] py-0.5 text-[11px] font-bold text-ok">
                Connected
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3.5">
            <Field id="stripeSecretKey" label="Secret key" hint="Starts with sk_live_ or sk_test_. Leave blank to keep existing.">
              <input
                id="stripeSecretKey" name="stripeSecretKey" type="password"
                placeholder={stripeConnected ? 'sk_••••••••••••••••' : 'sk_live_...'}
                className={inputClass}
              />
            </Field>
            <Field id="stripeWebhookSecret" label="Webhook secret" hint="From Stripe dashboard → Webhooks. Starts with whsec_. Leave blank to keep existing.">
              <input
                id="stripeWebhookSecret" name="stripeWebhookSecret" type="password"
                placeholder={stripeConnected ? 'whsec_••••••••••••••••' : 'whsec_...'}
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
        {state.success && <p className="text-[13px] text-ok">Settings saved.</p>}

        <div><SaveButton /></div>
      </form>
    </div>
  )
}
