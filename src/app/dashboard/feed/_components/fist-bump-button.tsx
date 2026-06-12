'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { toggleReaction } from '../_actions/toggle-reaction'

type Props = { scoreId: string; initialCount: number; initialReacted: boolean }

export function FistBumpButton({ scoreId, initialCount, initialReacted }: Props) {
  const [count, setCount] = useState(initialCount)
  const [reacted, setReacted] = useState(initialReacted)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    // Optimistic update
    setReacted(!reacted)
    setCount((c) => reacted ? c - 1 : c + 1)
    const result = await toggleReaction(scoreId)
    if (result.error) {
      // Revert on error
      setReacted(reacted)
      setCount(initialCount)
    } else {
      setCount(result.count)
      setReacted(result.reacted)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border-[1.5px] px-2.5 py-1 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60',
        reacted ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-transparent text-ink-3 hover:border-line-strong'
      )}
    >
      <span className="text-sm">👊</span>
      {count > 0 && <span className="font-mono text-xs">{count}</span>}
    </button>
  )
}
