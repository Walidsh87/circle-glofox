import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { formatHijri, inRamadanWindow } from '@/lib/hijri'
import { todayInTimezone } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import { BookingButton } from './_components/booking-button'
import { FamilyBookingRow } from './_components/family-booking-row'
import { waitlistPosition } from './_lib/waitlist'
import { env } from '@/env'
import { rosterFirstNames } from '@/lib/roster'
import { CalendarSyncCard } from './_components/calendar-sync-card'
import { PushCard } from './_components/push-card'

function formatDateTime(startsAt: string, timezone: string) {
  const date = new Date(startsAt)
  const dayLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
  return { dayLabel, time }
}

function dateKey(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(new Date(startsAt))
}

export default async function SchedulePage() {
  const { supabase, user, profile, boxName } = await requirePage()

  const now = new Date().toISOString()

  const [{ data: instances }, { data: box }, { data: myBookings }, { data: waitlist }, { data: me }] = await Promise.all([
    supabase
      .from('class_instances')
      .select(`id, starts_at, duration_minutes, capacity, status, class_templates(name), profiles(full_name), bookings(athlete_id, profiles!bookings_athlete_id_fkey(full_name))`)
      .eq('box_id', profile.box_id)
      .eq('status', 'scheduled')
      .gte('starts_at', now)
      .order('starts_at')
      .limit(30),
    supabase.from('boxes').select('timezone, roster_public, ramadan_start, ramadan_end').eq('id', profile.box_id).single(),
    supabase.from('bookings').select('class_instance_id').eq('athlete_id', user.id),
    supabase.from('class_waitlist').select('class_instance_id, athlete_id, created_at').eq('box_id', profile.box_id),
    supabase.from('profiles').select('calendar_token').eq('id', user.id).single(),
  ])

  const timezone = box?.timezone ?? 'Asia/Dubai'
  const rosterPublic = box?.roster_public === true
  const todayIso = todayInTimezone(timezone)

  // Family (#84): co-members this athlete can book for.
  let coMembers: { id: string; name: string }[] = []
  const { data: meHh } = await supabase.from('profiles').select('household_id').eq('id', user.id).single()
  if (meHh?.household_id) {
    const { data: fam } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('household_id', meHh.household_id)
      .neq('id', user.id)
    coMembers = ((fam ?? []) as { id: string; full_name: string | null; role: string }[])
      .filter((f) => f.role === 'athlete')
      .map((f) => ({ id: f.id, name: (f.full_name ?? 'Member').split(' ')[0] }))
  }
  const feedUrl = me?.calendar_token ? `${env.NEXT_PUBLIC_APP_URL}/api/calendar/${me.calendar_token}` : null
  const bookedInstanceIds = new Set((myBookings ?? []).map((b) => b.class_instance_id))

  const waitlistByInstance = new Map<string, { athlete_id: string; created_at: string }[]>()
  for (const w of (waitlist ?? []) as { class_instance_id: string; athlete_id: string; created_at: string }[]) {
    const arr = waitlistByInstance.get(w.class_instance_id) ?? []
    arr.push({ athlete_id: w.athlete_id, created_at: w.created_at })
    waitlistByInstance.set(w.class_instance_id, arr)
  }

  const grouped = new Map<string, typeof instances>()
  for (const instance of instances ?? []) {
    const key = dateKey(instance.starts_at, timezone)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(instance)
  }

  return (
    <DashboardShell
      active="schedule"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Book a Class"
      actions={
        <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
          {formatHijri(todayIso)}
          {inRamadanWindow(todayIso, box?.ramadan_start ?? null, box?.ramadan_end ?? null) && (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">Ramadan timetable</span>
          )}
        </span>
      }
    >
      <div className="max-w-[640px]">
        <CalendarSyncCard feedUrl={feedUrl} />
        <PushCard vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </div>
      {grouped.size === 0 && (
        <div className="max-w-[640px] rounded-[14px] border border-line bg-surface px-6 py-12 text-center text-[13px] text-ink-3">
          No upcoming classes. Generate instances from the Class Schedule page.
        </div>
      )}

      <div className="flex max-w-[640px] flex-col gap-6">
        {Array.from(grouped.entries()).map(([, dayInstances]) => {
          const first = dayInstances![0]
          const { dayLabel } = formatDateTime(first.starts_at, timezone)
          return (
            <div key={dayLabel}>
              <div className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">{dayLabel}</div>
              <div className="flex flex-col gap-2">
                {dayInstances!.map((instance) => {
                  const { time } = formatDateTime(instance.starts_at, timezone)
                  const bookings = instance.bookings as { athlete_id: string; profiles: { full_name: string } | { full_name: string }[] | null }[] | null
                  const bookedCount = bookings?.length ?? 0
                  const isFull = bookedCount >= instance.capacity
                  const isBooked = bookedInstanceIds.has(instance.id)
                  const template = instance.class_templates as { name: string } | { name: string }[] | null
                  const className = Array.isArray(template) ? template[0]?.name : template?.name
                  const coach = instance.profiles as { full_name: string } | { full_name: string }[] | null
                  const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
                  const pct = Math.min((bookedCount / instance.capacity) * 100, 100)

                  return (
                    <div
                      key={instance.id}
                      className={cn(
                        'flex items-center gap-4 rounded-xl border px-4 py-3.5 shadow-card',
                        isBooked ? 'border-accent bg-accent-soft' : isFull ? 'border-danger bg-surface' : 'border-line bg-surface'
                      )}
                    >
                      <div className="w-[52px] shrink-0 font-mono text-xl font-medium tracking-[-0.01em] text-ink">{time}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink">{className}</div>
                        <div className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                          {coachName ?? 'No coach'}
                        </div>
                        {/* Capacity bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-sm bg-surface-2">
                            <div className={cn('h-full rounded-sm', isFull ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="shrink-0 font-mono text-[11px] text-ink-3">
                            {bookedCount}/{instance.capacity}
                          </span>
                        </div>
                        {rosterPublic && bookedCount > 0 && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-[11.5px] text-ink-3">Who&apos;s coming ({bookedCount})</summary>
                            <p className="mt-1 text-xs text-ink-2">
                              {rosterFirstNames((bookings ?? []).map((b) => { const p = b.profiles; return Array.isArray(p) ? (p[0]?.full_name ?? null) : (p?.full_name ?? null) })).join(', ')}
                            </p>
                          </details>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        {(() => {
                          const entries = waitlistByInstance.get(instance.id) ?? []
                          const pos = waitlistPosition(entries, user.id)
                          return <BookingButton instanceId={instance.id} isBooked={isBooked} isFull={isFull} isWaitlisted={pos !== null} waitlistPosition={pos} />
                        })()}
                        {coMembers.length > 0 && !isFull && (
                          <FamilyBookingRow
                            instanceId={instance.id}
                            members={coMembers.map((m) => ({
                              ...m,
                              booked: (bookings ?? []).some((b) => b.athlete_id === m.id),
                            }))}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardShell>
  )
}
