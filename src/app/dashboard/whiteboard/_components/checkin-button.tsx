'use client'

import { useState } from 'react'
import { checkIn } from '../_actions/check-in'

export function CheckInButton({
  instanceId,
  athleteId,
  athleteName,
  checkedIn,
}: {
  instanceId: string
  athleteId: string
  athleteName: string
  checkedIn: boolean
}) {
  const [done, setDone] = useState(checkedIn)
  const [loading, setLoading] = useState(false)

  async function handleTap() {
    if (done) return
    setLoading(true)
    const { error } = await checkIn(instanceId, athleteId)
    if (error) alert(error)
    else setDone(true)
    setLoading(false)
  }

  return (
    <button
      onClick={handleTap}
      disabled={loading || done}
      style={{
        width: '100%', borderRadius: 12, padding: '14px 16px',
        textAlign: 'left', fontWeight: 600, fontSize: 15,
        cursor: done ? 'default' : 'pointer',
        background: done ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
        border: `1px solid ${done ? 'var(--c-ok-soft)' : 'var(--c-border)'}`,
        color: done ? 'var(--c-ok-ink)' : 'var(--c-ink)',
        fontFamily: 'inherit', transition: 'background 150ms',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      {done && <span style={{ fontSize: 14 }}>✓</span>}
      <span style={{ flex: 1 }}>{athleteName}</span>
      {loading && <span style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>…</span>}
    </button>
  )
}
