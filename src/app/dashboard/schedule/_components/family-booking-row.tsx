'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'
import { useT } from '@/components/i18n/locale-provider'

type FamilyMember = { id: string; name: string; booked: boolean }

export function FamilyBookingRow({ instanceId, members }: { instanceId: string; members: FamilyMember[] }) {
  const t = useT()
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(m: FamilyMember) {
    setBusyId(m.id)
    setError(null)
    const res = m.booked ? await cancelBooking(instanceId, m.id) : await bookClass(instanceId, m.id)
    if ('needsCredits' in res && res.needsCredits) setError(t('schedule.familyNeedsCredit', { name: m.name }))
    else if (res.error) setError(res.error)
    else router.refresh()
    setBusyId(null)
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-0.5">
      {members.map((m) => (
        <button
          key={m.id}
          onClick={() => toggle(m)}
          disabled={busyId !== null}
          className="font-mono text-[11px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          {busyId === m.id ? '…' : m.booked ? t('schedule.memberCancel', { name: m.name }) : t('schedule.memberBook', { name: m.name })}
        </button>
      ))}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  )
}
