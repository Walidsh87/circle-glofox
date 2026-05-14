import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckInButton } from './_components/checkin-button'

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
  const now = new Date()
  // Shift by timezone offset to get local date
  const localMs = now.getTime() + offsetHours * 60 * 60 * 1000
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
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(startsAt))
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

  const { data: instances } = await supabase
    .from('class_instances')
    .select(`
      id, starts_at, capacity, status,
      class_templates(name),
      profiles(full_name),
      bookings(athlete_id, checked_in, profiles(full_name))
    `)
    .eq('box_id', profile.box_id)
    .eq('status', 'scheduled')
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')

  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-gray-400 text-sm uppercase tracking-widest">{box?.name}</p>
          <h1 className="text-3xl font-bold mt-1">{today}</h1>
        </div>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back
        </Link>
      </div>

      {(!instances || instances.length === 0) && (
        <div className="text-center text-gray-500 mt-24 text-lg">
          No classes scheduled for today.
        </div>
      )}

      {/* Class cards — horizontal scroll on wide tablets */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

          return (
            <div key={instance.id} className="bg-gray-800 rounded-2xl p-5">
              <div className="mb-4">
                <p className="text-2xl font-bold">{time}</p>
                <p className="text-lg font-semibold text-white mt-1">{className}</p>
                <p className="text-sm text-gray-400">{coachName ?? 'No coach'}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {checkedInCount}/{bookings?.length ?? 0} checked in · {instance.capacity} cap
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {bookings?.length === 0 && (
                  <p className="text-gray-500 text-sm">No bookings yet.</p>
                )}
                {bookings?.map((booking) => {
                  const athleteProfile = Array.isArray(booking.profiles)
                    ? booking.profiles[0]
                    : booking.profiles
                  return (
                    <CheckInButton
                      key={booking.athlete_id}
                      instanceId={instance.id}
                      athleteId={booking.athlete_id}
                      athleteName={athleteProfile?.full_name ?? 'Unknown'}
                      checkedIn={booking.checked_in}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
