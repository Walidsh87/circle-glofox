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
      className="rounded-lg border border-line px-3 py-1 text-xs text-danger transition-colors hover:border-danger disabled:cursor-not-allowed disabled:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {loading ? 'Removing…' : 'Remove'}
    </button>
  )
}
