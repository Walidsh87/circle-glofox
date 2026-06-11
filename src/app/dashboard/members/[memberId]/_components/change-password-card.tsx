'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validateNewPassword } from '@/lib/auth/password'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', borderRadius: 8,
  border: '1px solid var(--c-border)', background: 'var(--c-surface)',
  fontSize: 14, color: 'var(--c-ink)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export function ChangePasswordCard() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(password, confirm)
    if (invalid) { setError(invalid); return }
    setError(null)
    setSaving(true)
    const supabase = createClient()
    // Stamping has_password drives the dashboard nudge; UX hint, not a security control.
    const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } })
    setSaving(false)
    if (error) setError(error.message)
    else { setDone(true); setPassword(''); setConfirm('') }
  }

  return (
    <section style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Password</h2>
      {done ? (
        <p style={{ fontSize: 13.5, color: 'var(--c-ink)' }}>Password updated — use it next time you sign in.</p>
      ) : (
        <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
          <input type="password" autoComplete="new-password" placeholder="New password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
          {error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={saving || !password || !confirm} style={{ height: 38, borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving || !password || !confirm ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Set password'}
          </button>
        </form>
      )}
    </section>
  )
}
