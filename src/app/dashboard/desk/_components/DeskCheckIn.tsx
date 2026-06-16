'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { loadMemberContext } from '../_actions/load-member-context'
import { checkIn } from '@/app/dashboard/whiteboard/_actions/check-in'
import { overrideCheckIn } from '@/app/dashboard/whiteboard/_actions/override-check-in'

type Booking = {
  bookingId: string
  instanceId: string
  className: string
  startsAt: string
  checkedIn: boolean
}

type RowState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; message: string }
  | { status: 'blocked'; reason: string; lastPaidDate: string | null; overrideReason: string; overrideBusy: boolean; overrideError: string | null }

const PRESET_REASONS = ['Card on file failed', 'Pays today at desk', 'New member — setup pending', 'Other'] as const
type PresetReason = typeof PRESET_REASONS[number]

function humanizeBlockReason(reason: string): string {
  if (reason === 'unpaid') return 'Payment overdue'
  if (reason === 'no_membership') return 'No active membership'
  if (reason === 'frozen') return 'Membership frozen'
  return reason
}

function formatTime(isoString: string): string {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function BookingRow({
  booking,
  athleteId,
  onCheckedIn,
}: {
  booking: Booking
  athleteId: string
  onCheckedIn: () => void
}) {
  const [state, setState] = useState<RowState>({ status: 'idle' })
  const [selectedPreset, setSelectedPreset] = useState<PresetReason | null>(null)
  const [otherText, setOtherText] = useState('')

  async function handleCheckIn() {
    setState({ status: 'busy' })
    const result = await checkIn(booking.instanceId, athleteId)
    if (result.error === null) {
      onCheckedIn()
      return
    }
    if (result.error === 'BLOCKED' && result.blocked) {
      setState({
        status: 'blocked',
        reason: result.blocked.reason,
        lastPaidDate: result.blocked.lastPaidDate,
        overrideReason: '',
        overrideBusy: false,
        overrideError: null,
      })
      return
    }
    setState({ status: 'error', message: result.error ?? 'Unknown error' })
  }

  async function handleOverride() {
    if (state.status !== 'blocked') return
    const finalReason = selectedPreset === 'Other' ? otherText.trim() : (selectedPreset ?? '')
    if (!finalReason) return
    setState({ ...state, overrideBusy: true, overrideError: null })
    const result = await overrideCheckIn(booking.instanceId, athleteId, finalReason)
    if (result.error) {
      setState({ ...state, overrideBusy: false, overrideError: result.error })
      return
    }
    onCheckedIn()
  }

  if (booking.checkedIn) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <span className="font-mono text-xs text-ink-3">{formatTime(booking.startsAt)}</span>
        <span className="flex-1 text-[13px] text-ink">{booking.className}</span>
        <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">✓ Checked in</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-ink-3">{formatTime(booking.startsAt)}</span>
        <span className="flex-1 text-[13px] text-ink">{booking.className}</span>
        <Button
          size="sm"
          disabled={state.status === 'busy'}
          onClick={handleCheckIn}
        >
          {state.status === 'busy' ? 'Checking in…' : 'Check in'}
        </Button>
      </div>

      {state.status === 'error' && (
        <p className="mt-2 text-xs text-danger">{state.message}</p>
      )}

      {state.status === 'blocked' && (
        <div className="mt-3 rounded-lg border border-warn-soft bg-warn-soft/30 px-3 py-2.5">
          <p className="text-[12.5px] font-semibold text-warn">
            ⚠️ {humanizeBlockReason(state.reason)}
          </p>
          {state.lastPaidDate && (
            <p className="mt-0.5 text-xs text-ink-3">
              Last paid:{' '}
              {new Date(state.lastPaidDate).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}

          <div className="mb-2 mt-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
            Reason for override
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((r) => {
              const active = selectedPreset === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedPreset(r)}
                  className={
                    'rounded-full border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
                    (active
                      ? 'border-accent bg-surface-2 text-accent-ink'
                      : 'border-line bg-surface text-ink-2 hover:border-line-strong')
                  }
                >
                  {r}
                </button>
              )
            })}
          </div>

          {selectedPreset === 'Other' && (
            <input
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Describe the reason"
              maxLength={200}
              className="mb-3 h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent"
            />
          )}

          {state.overrideError && (
            <p className="mb-2 text-xs text-danger">{state.overrideError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setState({ status: 'idle' }); setSelectedPreset(null); setOtherText('') }}
              disabled={state.overrideBusy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                state.overrideBusy ||
                !selectedPreset ||
                (selectedPreset === 'Other' && !otherText.trim())
              }
              onClick={handleOverride}
            >
              {state.overrideBusy ? 'Saving…' : 'Override & check in'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function DeskCheckIn({ athleteId }: { athleteId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])

  useEffect(() => {
    loadMemberContext(athleteId).then((result) => {
      setLoading(false)
      if (result.error) { setError(result.error); return }
      setBookings(result.ctx?.todayBookings ?? [])
    })
  }, [athleteId])

  function flipCheckedIn(instanceId: string) {
    setBookings((prev) =>
      prev.map((b) => (b.instanceId === instanceId ? { ...b, checkedIn: true } : b))
    )
  }

  return (
    <Card className="p-4">
      <div className="mb-3 font-mono text-xs uppercase text-ink-3">Check in</div>

      {loading && <p className="text-[13px] text-ink-3">Loading…</p>}

      {!loading && error && <p className="text-[13px] text-danger">{error}</p>}

      {!loading && !error && bookings.length === 0 && (
        <p className="text-[13px] text-ink-3">
          No classes booked today.{' '}
          <Link href="/dashboard/schedule" className="text-accent-ink underline">
            View schedule
          </Link>
        </p>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div className="flex flex-col gap-2">
          {bookings.map((b) => (
            <BookingRow
              key={b.instanceId}
              booking={b}
              athleteId={athleteId}
              onCheckedIn={() => flipCheckedIn(b.instanceId)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
