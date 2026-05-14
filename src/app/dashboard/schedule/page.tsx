import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { BookingButton } from './_components/booking-button'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const now = new Date().toISOString()

  const [{ data: instances }, { data: box }, { data: myBookings }] = await Promise.all([
    supabase
      .from('class_instances')
      .select(`id, starts_at, duration_minutes, capacity, status, class_templates(name), profiles(full_name), bookings(athlete_id)`)
      .eq('box_id', profile.box_id)
      .eq('status', 'scheduled')
      .gte('starts_at', now)
      .order('starts_at')
      .limit(30),
    supabase.from('boxes').select('timezone').eq('id', profile.box_id).single(),
    supabase.from('bookings').select('class_instance_id').eq('athlete_id', user.id),
  ])

  const timezone = box?.timezone ?? 'Asia/Dubai'
  const bookedInstanceIds = new Set((myBookings ?? []).map((b) => b.class_instance_id))

  const grouped = new Map<string, typeof instances>()
  for (const instance of instances ?? []) {
    const key = dateKey(instance.starts_at, timezone)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(instance)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="schedule" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Book a Class
          </h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          {grouped.size === 0 && (
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 14, padding: '48px 24px', textAlign: 'center',
              color: 'var(--c-ink-muted)', fontSize: 13,
            }}>
              No upcoming classes. Generate instances from the Class Schedule page.
            </div>
          )}

          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Array.from(grouped.entries()).map(([, dayInstances]) => {
              const first = dayInstances![0]
              const { dayLabel } = formatDateTime(first.starts_at, timezone)
              return (
                <div key={dayLabel}>
                  <div className="mono" style={{
                    fontSize: 10.5, fontWeight: 600, color: 'var(--c-ink-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
                  }}>{dayLabel}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      const pct = Math.min((bookedCount / instance.capacity) * 100, 100)

                      return (
                        <div key={instance.id} style={{
                          background: isBooked ? 'var(--circle-lime-soft)' : 'var(--c-surface)',
                          border: `1px solid ${isBooked ? 'var(--circle-lime)' : isFull ? 'var(--c-danger)' : 'var(--c-border)'}`,
                          borderRadius: 12, padding: '14px 18px',
                          display: 'flex', alignItems: 'center', gap: 16,
                          boxShadow: 'var(--c-shadow-sm)',
                        }}>
                          <div className="mono" style={{
                            fontSize: 20, fontWeight: 500, color: 'var(--c-ink)',
                            letterSpacing: '-0.01em', flexShrink: 0, width: 52,
                          }}>{time}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c-ink)' }}>{className}</div>
                            <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                              {coachName ?? 'No coach'}
                            </div>
                            {/* Capacity bar */}
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 4, background: 'var(--c-surface-alt)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: isFull ? 'var(--c-danger)' : 'var(--circle-lime)', borderRadius: 2 }} />
                              </div>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', flexShrink: 0 }}>
                                {bookedCount}/{instance.capacity}
                              </span>
                            </div>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <BookingButton instanceId={instance.id} isBooked={isBooked} isFull={isFull} />
                          </div>
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
    </div>
  )
}
