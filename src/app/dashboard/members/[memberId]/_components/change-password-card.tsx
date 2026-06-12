'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validateNewPassword } from '@/lib/auth/password'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const inputClass =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

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
    <Card className="p-5">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Password</h2>
      {done ? (
        <p className="text-[13.5px] text-ink">Password updated — use it next time you sign in.</p>
      ) : (
        <form onSubmit={onSave} className="flex max-w-xs flex-col gap-2.5">
          <input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <input type="password" autoComplete="new-password" aria-label="Confirm new password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          {error && <p role="alert" className="m-0 text-xs text-danger">{error}</p>}
          <Button type="submit" size="sm" disabled={saving || !password || !confirm}>
            {saving ? 'Saving…' : 'Set password'}
          </Button>
        </form>
      )}
    </Card>
  )
}
