import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckInButton } from './_components/checkin-button'
import { CircleMark } from '@/components/circle-mark'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { loadForPercent } from '@/lib/percentage'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai':   4,
  'Asia/Muscat':  4,
  'Asia/Riyadh':  3,
  'Asia/Qatar':   3,
  'Asia/Kuwait':  3,
  'Asia/Bahrain': 3,
}

function todayWindow(timezone: string): { start: string; end: string } {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localMs = Date.now() + offsetHours * 60 * 60 * 1000
  const localDate = new Date(localMs).toISOString().slice(0, 10)
  const sign = offsetHours >= 0 ? '+' : '-'
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
  return {
    start: `${localDate}T00:00:00${offset}`,
    end:   `${localDate}T23:59:59${offset}`,
  }
}

function formatTime(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(startsAt))
}

function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localMs = Date.now() + offsetHours * 60 * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
}

export default async function WhiteboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const { data: box } = await supabase
    .from('boxes')
    .select('name, timezone')
    .eq('id', profile.box_id)
    .single()

  const timezone = box?.timezone ?? 'Asia/Dubai'
  const { start, end } = todayWindow(timezone)

  const { data: instances, error: instancesError } = await supabase
    .from('class_instances')
    .select(`
      id, starts_at, capacity, status,
      class_templates(name),
      profiles(full_name),
      bookings(athlete_id, checked_in, profiles!bookings_athlete_id_fkey(full_name))
    `)
    .eq('box_id', profile.box_id)
    .eq('status', 'scheduled')
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')

  if (instancesError) console.error('[whiteboard] instances query error:', instancesError)

  // Fetch memberships for all athletes booked into today's classes (separate query — avoids nested-join ambiguity)
  const athleteIds = Array.from(new Set(
    (instances ?? []).flatMap((inst) => {
      const bks = inst.bookings as { athlete_id: string }[] | null
      return (bks ?? []).map((b) => b.athlete_id)
    })
  ))

  const { data: membershipRows } = athleteIds.length > 0
    ? await supabase
        .from('memberships')
        .select('athlete_id, payment_status, end_date, last_paid_date')
        .in('athlete_id', athleteIds)
        .eq('box_id', profile.box_id)
    : { data: [] as Array<{ athlete_id: string; payment_status: 'paid' | 'unpaid' | 'overdue'; end_date: string | null; last_paid_date: string | null }> }

  const membershipsByAthlete = new Map<string, Array<MembershipRow & { last_paid_date: string | null }>>()
  for (const m of membershipRows ?? []) {
    const arr = membershipsByAthlete.get(m.athlete_id) ?? []
    arr.push({ payment_status: m.payment_status as 'paid' | 'unpaid', end_date: m.end_date, last_paid_date: m.last_paid_date })
    membershipsByAthlete.set(m.athlete_id, arr)
  }

  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())

  const todayIso = todayLocalDate(timezone)

  // The Wedge — today's strength prescription + each booked athlete's 1RM for that lift
  const { data: wod } = await supabase
    .from('workouts')
    .select('strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .eq('date', todayIso)
    .maybeSingle()

  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const topPct = strengthSets.length ? Math.max(...strengthSets.map((s) => s.percentage)) : null
  const liftLabel = wod?.strength_lift
    ? (LIFT_NAMES.find((l) => l.value === wod.strength_lift)?.label ?? wod.strength_lift)
    : null

  const { data: liftRows } = wod?.strength_lift && athleteIds.length > 0
    ? await supabase
        .from('athlete_lifts')
        .select('athlete_id, one_rm_grams')
        .eq('box_id', profile.box_id)
        .eq('lift_name', wod.strength_lift)
        .in('athlete_id', athleteIds)
    : { data: [] as Array<{ athlete_id: string; one_rm_grams: number }> }

  const oneRmByAthlete = new Map((liftRows ?? []).map((r) => [r.athlete_id, r.one_rm_grams]))

  return (
    <div className="circle-dark" style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-geist-sans)',
    }}>
      {/* Header */}
      <header style={{
        height: 70, borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', padding: '0 36px', gap: 24, flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontFamily: 'var(--font-space-grotesk)', fontWeight: 700,
          fontSize: 17, letterSpacing: '0.02em', textTransform: 'uppercase',
          color: 'var(--c-ink)',
        }}>
          <CircleMark size={22} onDark />
          <span>Circle</span>
          <span className="mono" style={{
            fontSize: 11, color: 'var(--circle-lime)', marginLeft: 8,
            padding: '2px 8px', border: '1px solid var(--circle-lime)', borderRadius: 4,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500,
          }}>Whiteboard</span>
        </div>

        <div style={{ width: 1, height: 26, background: 'var(--c-border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="c-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--circle-lime)', flexShrink: 0 }} />
          <span className="mono" style={{ fontSize: 13, color: 'var(--c-ink)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Live · {box?.name}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div className="mono" style={{ fontSize: 15, color: 'var(--c-ink-muted)' }}>{today}</div>

        <a href="/dashboard" style={{
          fontSize: 12, color: 'var(--c-ink-muted)', textDecoration: 'none',
          padding: '6px 12px', border: '1px solid var(--c-border)', borderRadius: 8,
        }}>← Dashboard</a>
      </header>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px 36px' }}>
        {liftLabel && topPct !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            padding: '14px 20px', borderRadius: 12,
            background: 'var(--c-surface)', border: '1px solid var(--circle-lime)',
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Strength
            </span>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 18, color: 'var(--c-ink)' }}>
              {liftLabel}
            </span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>
              {strengthSets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
            </span>
          </div>
        )}

        {(!instances || instances.length === 0) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '60vh', color: 'var(--c-ink-muted)', fontSize: 18,
            fontFamily: 'var(--font-space-grotesk)',
          }}>
            No classes scheduled for today.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {instances?.map((instance) => {
            const template = instance.class_templates as { name: string } | { name: string }[] | null
            const className = Array.isArray(template) ? template[0]?.name : template?.name
            const coach = instance.profiles as { full_name: string } | { full_name: string }[] | null
            const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
            const bookings = instance.bookings as {
              athlete_id: string
              checked_in: boolean
              profiles: { full_name: string } | { full_name: string }[]
            }[] | null
            const time = formatTime(instance.starts_at, timezone)
            const checkedInCount = bookings?.filter((b) => b.checked_in).length ?? 0
            const totalBooked = bookings?.length ?? 0

            return (
              <div key={instance.id} style={{
                background: 'var(--c-surface)',
                border: '1px solid var(--c-border-strong)',
                borderRadius: 16, overflow: 'hidden',
              }}>
                {/* Class header */}
                <div style={{
                  padding: '20px 22px',
                  borderBottom: '1px solid var(--c-border)',
                  background: 'var(--c-surface-sunk)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--circle-lime)', letterSpacing: '-0.02em' }}>{time}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
                      {checkedInCount}/{totalBooked} in · cap {instance.capacity}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.015em' }}>
                    {className}
                  </div>
                  {coachName && (
                    <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 4 }}>
                      Coach {coachName}
                    </div>
                  )}
                </div>

                {/* Athletes list */}
                <div style={{ padding: '14px 22px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(!bookings || bookings.length === 0) && (
                    <p style={{ fontSize: 13, color: 'var(--c-ink-faint)' }}>No bookings yet.</p>
                  )}
                  {bookings?.map((booking) => {
                    const athleteProfile = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles
                    const memberships = membershipsByAthlete.get(booking.athlete_id) ?? []
                    const status = getMembershipStatus(memberships, todayIso)
                    const lastPaid = memberships
                      .map((m) => m.last_paid_date)
                      .filter((d): d is string => !!d)
                      .sort()
                      .pop() ?? null
                    const oneRm = oneRmByAthlete.get(booking.athlete_id) ?? null
                    const load = wod?.strength_lift && topPct !== null
                      ? (oneRm !== null ? `${loadForPercent(oneRm, topPct).barKg} kg` : '— log 1RM')
                      : null
                    return (
                      <div key={booking.athlete_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <CheckInButton
                            instanceId={instance.id}
                            athleteId={booking.athlete_id}
                            athleteName={athleteProfile?.full_name ?? 'Unknown'}
                            checkedIn={booking.checked_in}
                            membershipStatus={status}
                            lastPaidDate={lastPaid}
                          />
                        </div>
                        {load && (
                          <span className="mono" style={{
                            fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap',
                            color: oneRm !== null ? 'var(--circle-lime-ink)' : 'var(--c-ink-faint)',
                          }}>{load}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
