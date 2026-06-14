'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { checkIn } from '../_actions/check-in'
import { uncheckIn } from '../_actions/uncheck-in'
import { OverrideModal } from './override-modal'
import type { MembershipStatus } from '@/lib/membership-status'

const DISARM_MS = 3000

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
  const [armed, setArmed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [blockReason, setBlockReason] = useState<'unpaid' | 'no_membership' | 'frozen'>('unpaid')
  const [modalLastPaid, setModalLastPaid] = useState<string | null>(null)
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearDisarm() {
    if (disarmTimer.current) { clearTimeout(disarmTimer.current); disarmTimer.current = null }
  }
  useEffect(() => () => { if (disarmTimer.current) clearTimeout(disarmTimer.current) }, [])

  async function handleTap() {
    if (loading) return

    // Already checked in: first tap arms the undo, second tap reverts.
    if (done) {
      if (!armed) {
        setArmed(true)
        clearDisarm()
        disarmTimer.current = setTimeout(() => setArmed(false), DISARM_MS)
        return
      }
      clearDisarm()
      setLoading(true)
      const result = await uncheckIn(instanceId, athleteId)
      setLoading(false)
      if (result.error) { alert(result.error); return }
      setArmed(false)
      setDone(false)
      return
    }

    // Not checked in: existing check-in flow (entitlement gate may open the override modal).
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

  // A not-yet-checked-in, non-paid row carries a status indicator: a danger dot
  // when nothing covers it, or a "Pack" badge when a credit does.
  const showStatusIndicator = !done && membershipStatus !== 'paid'
  const showDot = showStatusIndicator && !hasCredit
  const dotTitle = membershipStatus === 'unpaid'
    ? `Payment overdue${lastPaidDate ? ` — last paid ${new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
    : membershipStatus === 'frozen' ? 'Membership frozen'
    : 'No active membership'

  return (
    <>
      <button
        onClick={handleTap}
        disabled={loading}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border px-4 py-3.5 text-left text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          done && armed
            ? 'cursor-pointer border-warn-soft bg-warn-soft text-warn'
            : done
            ? 'cursor-pointer border-ok-soft bg-ok-soft text-ok'
            : 'border-line bg-surface-2 text-ink hover:border-line-strong'
        )}
      >
        {done && <span className="text-sm">✓</span>}
        {showDot && (
          <span title={dotTitle} className="h-2 w-2 shrink-0 rounded-full bg-danger" />
        )}
        {showStatusIndicator && hasCredit && (
          <span
            title="Booked with a class credit"
            className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-accent-ink"
          >
            Pack
          </span>
        )}
        <span className="flex-1">{done && armed ? 'Tap to undo' : athleteName}</span>
        {loading && <span className="text-[11px] text-ink-faint">…</span>}
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
