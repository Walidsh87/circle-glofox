import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookingButton } from './_components/booking-button'

function formatDateTime(startsAt: string, timezone: string) {
  const date = new Date(startsAt)
  const dayLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return { dayLabel, time }
}

function dateKey(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(
    new Date(startsAt)
  )
}

export default async function SchedulePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const now = new Date().toISOString()

  const [{ data: instances }, { data: box }, { data: myBookings }] = await Promise.all([
    supabase
      .from('class_instances')
      .select(`
        id, starts_at, duration_minutes, capacity, status,
        class_templates(name),
        profiles(full_name),
        bookings(athlete_id)
      `)
      .eq('box_id', profile.box_id)
      .eq('status', 'scheduled')
      .gte('starts_at', now)
      .order('starts_at')
      .limit(30),
    supabase
      .from('boxes')
      .select('timezone')
      .eq('id', profile.box_id)
      .single(),
    supabase
      .from('bookings')
      .select('class_instance_id')
      .eq('athlete_id', user.id),
  ])

  const timezone = box?.timezone ?? 'Asia/Dubai'
  const bookedInstanceIds = new Set((myBookings ?? []).map((b) => b.class_instance_id))

  // Group instances by date
  const grouped = new Map<string, typeof instances>()
  for (const instance of instances ?? []) {
    const key = dateKey(instance.starts_at, timezone)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(instance)
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold">Schedule</h1>
        </div>

        {grouped.size === 0 && (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
            No upcoming classes. Generate instances from the Class Schedule page.
          </div>
        )}

        {Array.from(grouped.entries()).map(([, dayInstances]) => {
          const first = dayInstances![0]
          const { dayLabel } = formatDateTime(first.starts_at, timezone)
          return (
            <div key={dayLabel} className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {dayLabel}
              </p>
              <div className="flex flex-col gap-2">
                {dayInstances!.map((instance) => {
                  const { time } = formatDateTime(instance.starts_at, timezone)
                  const bookings = instance.bookings as { athlete_id: string }[] | null
                  const bookedCount = bookings?.length ?? 0
                  const isFull = bookedCount >= instance.capacity
                  const isBooked = bookedInstanceIds.has(instance.id)
                  const template = instance.class_templates as { name: string } | { name: string }[] | null
                  const className = Array.isArray(template) ? template[0]?.name : template?.name
                  const coach = instance.profiles as { full_name: string } | { full_name: string }[] | null
                  const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name

                  return (
                    <div key={instance.id}
                      className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold w-12 shrink-0">{time}</span>
                        <div>
                          <p className="text-sm font-medium">{className}</p>
                          <p className="text-xs text-gray-400">{coachName ?? 'No coach'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-400">
                          {bookedCount}/{instance.capacity}
                        </span>
                        <BookingButton
                          instanceId={instance.id}
                          isBooked={isBooked}
                          isFull={isFull}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
