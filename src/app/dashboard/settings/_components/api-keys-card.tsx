'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createApiKey } from '../_actions/create-api-key'
import { revokeApiKey } from '../_actions/revoke-api-key'

const btn =
  'h-9 rounded-lg border border-line-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const limeBtn =
  'h-9 rounded-lg bg-accent px-3.5 text-[12.5px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

const PHASE1_SCOPES: { scope: string; label: string }[] = [
  { scope: 'members:read', label: 'Members' },
  { scope: 'members:pii', label: 'Member email/phone' },
  { scope: 'classes:read', label: 'Classes' },
  { scope: 'bookings:read', label: 'Bookings' },
  { scope: 'memberships:read', label: 'Memberships' },
  { scope: 'packages:read', label: 'Packages' },
]

export type ApiKeyRow = {
  id: string
  label: string
  key_prefix: string
  scopes: string[]
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function ApiKeysCard({ keys, apiConfigured }: { keys: ApiKeyRow[]; apiConfigured: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [label, setLabel] = useState('')
  const [scopes, setScopes] = useState<string[]>(['members:read'])
  const [created, setCreated] = useState<string | null>(null) // plaintext, shown once
  const [copied, setCopied] = useState(false)

  function toggle(s: string) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  }
  function create() {
    start(async () => {
      const res = await createApiKey(label, scopes)
      if (res.error) { alert(res.error); return }
      setCreated(res.plaintext ?? null)
      setLabel('')
      setScopes(['members:read'])
      router.refresh()
    })
  }
  function revoke(id: string) {
    if (!confirm('Revoke this key? Integrations using it will stop working immediately.')) return
    start(async () => {
      const res = await revokeApiKey(id)
      if (res.error) alert(res.error)
      router.refresh()
    })
  }

  const active = keys.filter((k) => !k.revoked_at)

  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="text-sm font-semibold text-ink">API keys</div>
      <p className="mt-1 text-[12.5px] leading-normal text-ink-3">
        Keys for the public REST API (read access to your members, classes, bookings, memberships and packages). The full key is shown once at creation — store it safely. See <code className="font-mono">/api/v1/openapi.json</code> for the contract.
      </p>

      {!apiConfigured && (
        <p className="mt-3 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
          The API is not configured yet (no <code className="font-mono">API_KEY_PEPPER</code>). Keys can be created once it&apos;s set.
        </p>
      )}

      {/* show-once plaintext */}
      {created && (
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
          <div className="text-[12px] font-bold text-accent-ink">Copy your key now — you won&apos;t see it again.</div>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={created} onFocus={(e) => e.target.select()} className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 font-mono text-[12px] text-ink-2 outline-none" />
            <button type="button" className={btn} onClick={() => { navigator.clipboard.writeText(created); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" className={btn} onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      )}

      {/* existing keys */}
      {active.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {active.map((k) => (
            <li key={k.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink">{k.label}</div>
                <div className="truncate font-mono text-[11px] text-ink-3">{k.key_prefix}••••••  ·  {k.scopes.join(', ')}</div>
                <div className="text-[11px] text-ink-3">{k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString('en-GB')}` : 'Never used'}</div>
              </div>
              <button type="button" className={btn} disabled={pending} onClick={() => revoke(k.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}

      {/* create */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="text-[12.5px] font-semibold text-ink">Create a key</div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name (e.g. Zapier)"
          maxLength={80}
          className="mt-2 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {PHASE1_SCOPES.map((s) => (
            <label key={s.scope} className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={scopes.includes(s.scope)} onChange={() => toggle(s.scope)} className="accent-accent" />
              {s.label}
            </label>
          ))}
        </div>
        <button type="button" className={`${limeBtn} mt-3`} disabled={pending || !apiConfigured || !label.trim() || scopes.length === 0} onClick={create}>
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </div>
    </div>
  )
}
