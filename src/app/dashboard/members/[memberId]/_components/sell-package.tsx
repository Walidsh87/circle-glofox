'use client'

import { useState, useTransition } from 'react'
import { sellPackage } from '../_actions/sell-package'

type Pkg = { id: string; name: string; type: string; credit_count: number; price_aed: number }
type Credit = { id: string; kind: string; credits_remaining: number; credits_total: number; expires_at: string | null; packages: { name: string } | { name: string }[] | null }

const TYPE_LABEL: Record<string, string> = { class_pack: 'Class pack', drop_in: 'Drop-in', pt_block: 'PT block' }

function pkgName(c: Credit): string {
  const p = c.packages
  return Array.isArray(p) ? (p[0]?.name ?? 'Package') : (p?.name ?? 'Package')
}

export function SellPackage({ athleteId, packages, credits }: { athleteId: string; packages: Pkg[]; credits: Credit[] }) {
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSell() {
    setUrl(null); setError(null)
    startTransition(async () => {
      const res = await sellPackage(packageId, athleteId)
      if (res.error) setError(res.error)
      else setUrl(res.url)
    })
  }

  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Packages &amp; credits</p>

      {credits.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {credits.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-ink-2)' }}>
              <span>{pkgName(c)} <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>({c.kind === 'pt_session' ? 'PT' : 'class'})</span></span>
              <span className="mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 16 }}>No credits yet.</p>
      )}

      {packages.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No active packages. Create one under <strong>Packages</strong>.</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13 }}>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {TYPE_LABEL[p.type] ?? p.type} · {Number(p.price_aed).toFixed(2)} AED</option>
            ))}
          </select>
          <button onClick={onSell} disabled={pending || !packageId} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 600, opacity: pending ? 0.6 : 1 }}>
            {pending ? 'Creating…' : 'Generate payment link'}
          </button>
        </div>
      )}

      {error && <p style={{ color: 'var(--c-danger-ink)', fontSize: 12, marginTop: 10 }}>{error}</p>}
      {url && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--c-ink-2)', marginBottom: 4 }}>Send this payment link to the member:</p>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)', color: 'var(--c-ink)', fontSize: 12 }} />
        </div>
      )}
    </div>
  )
}
