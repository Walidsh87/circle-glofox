import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { CheckInButton } from './_components/checkin-button'
import { CircleMark } from '@/components/circle-mark'
import { cn } from '@/lib/utils'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { loadForPercent } from '@/lib/percentage'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { currentStreakWeeks } from '@/lib/consistency'
import { todayInTimezone, todayWindow } from '@/lib/timezone'
import { formatHijri, inRamadanWindow } from '@/lib/hijri'
import { groupByInto } from '@/lib/grouping'

function formatTime(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(startsAt))
}

export default async function WhiteboardPage() {
  const { supabase, profile } = await requireStaffPage()

  const { data: box } = await supabase
    .from('boxes')
    .select('name, timezone, ramadan_start, ramadan_end')
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
      bookings(athlete_id, checked_in, credit_id, profiles!bookings_athlete_id_fkey(full_name))
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

  const membershipsByAthlete = groupByInto(
    membershipRows ?? [],
    (m) => m.athlete_id,
    (m): MembershipRow & { last_paid_date: string | null } => ({ payment_status: m.payment_status as 'paid' | 'unpaid', end_date: m.end_date, last_paid_date: m.last_paid_date }),
  )

  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())

  const todayIso = todayInTimezone(timezone)

  // The Wedge — today's strength prescription + each booked athlete's 1RM for that lift
  const { data: wod } = await supabase
    .from('workouts')
    .select('strength_lift, strength_sets, scaling')
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

  // Committed Club: each rostered athlete's full checked-in history → current streak.
  const { data: attendanceRows } = athleteIds.length > 0
    ? await supabase
        .from('bookings')
        .select('athlete_id, class_instances(starts_at)')
        .eq('box_id', profile.box_id)
        .eq('checked_in', true)
        .in('athlete_id', athleteIds)
    : { data: [] as Array<{ athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }> }

  const datesByAthlete = new Map<string, string[]>()
  for (const r of attendanceRows ?? []) {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    const d = (ci as { starts_at: string } | null)?.starts_at?.slice(0, 10)
    if (!d) continue
    const arr = datesByAthlete.get(r.athlete_id) ?? []
    arr.push(d)
    datesByAthlete.set(r.athlete_id, arr)
  }
  const streakByAthlete = new Map<string, number>()
  for (const [id, dates] of datesByAthlete) streakByAthlete.set(id, currentStreakWeeks(dates, todayIso))

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-canvas">
      {/* Header */}
      <header className="flex h-[70px] shrink-0 items-center gap-6 border-b border-line px-9">
        {/* Logo */}
        <div className="flex items-center gap-[9px] font-display text-[17px] font-bold uppercase tracking-[0.02em] text-ink">
          <CircleMark size={22} onDark />
          <span>Circle</span>
          <span className="ml-2 rounded border border-accent px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-accent-ink">Whiteboard</span>
        </div>

        <div className="h-[26px] w-px bg-line" />

        <div className="flex items-center gap-2">
          <span className="c-pulse h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span className="font-mono text-[13px] uppercase tracking-[0.04em] text-ink">
            Live · {box?.name}
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 font-mono text-[15px] text-ink-3">
          <span>{today}</span>
          <span className="text-ink-faint">· {formatHijri(todayIso)}</span>
          {inRamadanWindow(todayIso, box?.ramadan_start ?? null, box?.ramadan_end ?? null) && (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">Ramadan timetable</span>
          )}
        </div>

        <Link href="/dashboard" className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink">
          ← Dashboard
        </Link>
      </header>

      {/* Body */}
      <div className="flex-1 px-9 py-8">
        {liftLabel && topPct !== null && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-accent bg-surface px-5 py-3.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent-ink">
              Strength
            </span>
            <span className="font-display text-lg font-bold text-ink">
              {liftLabel}
            </span>
            <span className="font-mono text-sm text-ink-3">
              {strengthSets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
            </span>
          </div>
        )}

        {((wod?.scaling ?? []) as import('@/app/dashboard/wod/_lib/validation').ScalingTier[]).length > 0 && (
          <div className="mb-5 flex flex-wrap gap-4">
            {((wod?.scaling ?? []) as import('@/app/dashboard/wod/_lib/validation').ScalingTier[]).map((t, i) => (
              <div key={i} className="flex-1 basis-60 rounded-xl border border-line bg-surface px-4 py-3">
                <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-accent-ink">{t.label}</div>
                <div className="whitespace-pre-wrap text-sm leading-normal text-ink-2">{t.description}</div>
              </div>
            ))}
          </div>
        )}

        {(!instances || instances.length === 0) && (
          <div className="flex h-[60vh] items-center justify-center font-display text-lg text-ink-3">
            No classes scheduled for today.
          </div>
        )}

        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {instances?.map((instance) => {
            const template = instance.class_templates as { name: string } | { name: string }[] | null
            const className = Array.isArray(template) ? template[0]?.name : template?.name
            const coach = instance.profiles as { full_name: string } | { full_name: string }[] | null
            const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
            const bookings = instance.bookings as {
              athlete_id: string
              checked_in: boolean
              credit_id: string | null
              profiles: { full_name: string } | { full_name: string }[]
            }[] | null
            const time = formatTime(instance.starts_at, timezone)
            const checkedInCount = bookings?.filter((b) => b.checked_in).length ?? 0
            const totalBooked = bookings?.length ?? 0

            return (
              <div key={instance.id} className="overflow-hidden rounded-2xl border border-line-strong bg-surface">
                {/* Class header */}
                <div className="border-b border-line bg-canvas px-[22px] py-5">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <div className="font-mono text-[28px] font-bold tracking-[-0.02em] text-accent-ink">{time}</div>
                    <div className="font-mono text-xs text-ink-3">
                      {checkedInCount}/{totalBooked} in · cap {instance.capacity}
                    </div>
                  </div>
                  <div className="font-display text-[22px] font-semibold tracking-[-0.015em] text-ink">
                    {className}
                  </div>
                  {coachName && (
                    <div className="mt-1 font-mono text-xs text-ink-3">
                      Coach {coachName}
                    </div>
                  )}
                </div>

                {/* Athletes list */}
                <div className="flex flex-col gap-1.5 px-[22px] pb-[18px] pt-3.5">
                  {(!bookings || bookings.length === 0) && (
                    <p className="text-[13px] text-ink-faint">No bookings yet.</p>
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
                    const streak = streakByAthlete.get(booking.athlete_id) ?? 0
                    return (
                      <div key={booking.athlete_id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <CheckInButton
                            instanceId={instance.id}
                            athleteId={booking.athlete_id}
                            athleteName={athleteProfile?.full_name ?? 'Unknown'}
                            checkedIn={booking.checked_in}
                            membershipStatus={status}
                            lastPaidDate={lastPaid}
                            hasCredit={!!booking.credit_id}
                          />
                        </div>
                        {streak > 0 && (
                          <span className="whitespace-nowrap font-mono text-xs font-bold text-accent-ink">🔥{streak}</span>
                        )}
                        {load && (
                          <span className={cn(
                            'whitespace-nowrap font-mono text-[15px] font-bold',
                            oneRm !== null ? 'text-accent-ink' : 'text-ink-2'
                          )}>{load}</span>
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
