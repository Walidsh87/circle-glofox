'use client'

import { useState } from 'react'
import { removeMember } from '../_actions/remove-member'

export function RemoveMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [loading, setLoading] = useState(false)

  async function handleRemove() {
    if (!confirm(`Remove ${memberName}? This cannot be undone.`)) return
    setLoading(true)
    const { error } = await removeMember(memberId)
    if (error) alert(error)
    setLoading(false)
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      style={{
        padding: '4px 12px', borderRadius: 7, fontSize: 12.5,
        background: 'none', border: '1px solid var(--c-border)',
        color: loading ? 'var(--c-ink-muted)' : 'var(--c-danger)',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? 'Removing…' : 'Remove'}
    </button>
  )
}
