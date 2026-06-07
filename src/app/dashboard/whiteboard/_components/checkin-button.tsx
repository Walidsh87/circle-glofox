'use client'

import { useState } from 'react'
import { checkIn } from '../_actions/check-in'
import { OverrideModal } from './override-modal'
import type { MembershipStatus } from '@/lib/membership-status'

export function CheckInButton({
  instanceId,
  athleteId,
  athleteName,
  checkedIn,
  membershipStatus,
  lastPaidDate,
  hasCredit = false,
}: {
  instanceId: string
  athleteId: string
  athleteName: string
  checkedIn: boolean
  membershipStatus: MembershipStatus
  lastPaidDate: string | null
  hasCredit?: boolean
}) {
  const [done, setDone] = useState(checkedIn)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [blockReason, setBlockReason] = useState<'unpaid' | 'no_membership'>('unpaid')
  const [modalLastPaid, setModalLastPaid] = useState<string | null>(null)

  async function handleTap() {
    if (done) return
    setLoading(true)
    const result = await checkIn(instanceId, athleteId)
    setLoading(false)
    if (result.error === 'BLOCKED' && result.blocked) {
      setBlockReason(result.blocked.reason)
      setModalLastPaid(result.blocked.lastPaidDate)
      setModalOpen(true)
      return
    }
    if (result.error) { alert(result.error); return }
    setDone(true)
  }

  const showDot = !done && membershipStatus !== 'paid' && !hasCredit
  const dotTitle = membershipStatus === 'unpaid'
    ? `Payment overdue${lastPaidDate ? ` — last paid ${new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
    : 'No active membership'

  return (
    <>
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
        {showDot && (
          <span
            title={dotTitle}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--c-danger)', flexShrink: 0,
            }}
          />
        )}
        {!done && membershipStatus !== 'paid' && hasCredit && (
          <span
            title="Booked with a class credit"
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
              background: 'var(--circle-lime-soft)', color: 'var(--circle-lime-ink)',
              textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
            }}
          >
            Pack
          </span>
        )}
        <span style={{ flex: 1 }}>{athleteName}</span>
        {loading && <span style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>…</span>}
      </button>
      <OverrideModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setDone(true)}
        instanceId={instanceId}
        athleteId={athleteId}
        athleteName={athleteName}
        blockReason={blockReason}
        lastPaidDate={modalLastPaid}
      />
    </>
  )
}
