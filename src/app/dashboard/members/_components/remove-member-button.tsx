'use client'

import { useState } from 'react'
import { removeMember } from '../_actions/remove-member'
import { Button } from '@/components/ui/button'

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
    <Button variant="ghost" size="sm" onClick={handleRemove} disabled={loading}
      className="text-destructive hover:text-destructive hover:bg-destructive/10">
      {loading ? 'Removing...' : 'Remove'}
    </Button>
  )
}
