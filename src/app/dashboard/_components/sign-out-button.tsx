'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <button
      onClick={handleSignOut}
      style={{
        height: 32, padding: '0 14px',
        background: 'transparent',
        border: '1px solid var(--c-border)',
        borderRadius: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 500,
        color: 'var(--c-ink-2)', fontFamily: 'inherit',
      }}
    >
      Sign out
    </button>
  )
}
