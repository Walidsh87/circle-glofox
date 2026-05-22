'use client'

import { useState } from 'react'
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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 20,
        border: `1.5px solid ${reacted ? 'var(--circle-lime)' : 'var(--c-border)'}`,
        background: reacted ? 'var(--circle-lime-soft)' : 'transparent',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 600,
        color: reacted ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)',
        fontFamily: 'inherit',
        transition: 'all 120ms',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 14 }}>👊</span>
      {count > 0 && <span className="mono" style={{ fontSize: 12 }}>{count}</span>}
    </button>
  )
}
