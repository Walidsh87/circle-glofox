import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { GymLoginForm } from '@/app/[gymSlug]/_components/gym-login-form'
import { CircleMark } from '@/components/circle-mark'
import { checkInWindow } from '@/lib/self-checkin'
import { CheckInButton } from '../_components/check-in-button'

export const dynamic = 'force-dynamic'

// Gulf timezones have no DST — a fixed-offset map is the house convention (see /tv/[token]).
const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}

function localTime(iso: string, offsetHours: number): string {
  return new Date(new Date(iso).getTime() + offsetHours * 3_600_000).toISOString().slice(11, 16)
}

type BookingRow = {
  class_instance_id: string
  checked_in: boolean
  class_instances: { starts_at: string; status: string; class_templates: { name: string } | { name: string }[] | null } | { starts_at: string; status: string; class_templates: { name: string } | { name: string }[] | null }[] | null
}

function Shell({ boxName, children }: { boxName: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)', display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 26, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 17, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-ink)' }}>
          <CircleMark size={22} />
          <span>{boxName}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

export default async function CheckinPage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // Token resolution has no session yet → service role; everything after is box-scoped.
  const service = createServiceClient()
  const { data: box } = await service
    .from('boxes')
    .select('id, name, slug, timezone')
    .eq('checkin_token', token)
    .maybeSingle()
  if (!box) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <GymLoginForm gymName={box.name} gymSlug={box.slug ?? ''} redirectTo={`/checkin/${token}`} />
  }

  const { data: profile } = await supabase.from('profiles').select('box_id, full_name').eq('id', user.id).single()
  if (!profile || profile.box_id !== box.id) {
    return (
      <Shell boxName={box.name}>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, color: 'var(--c-ink)', marginBottom: 8 }}>Wrong gym</h1>
        <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>This QR belongs to another gym.</p>
      </Shell>
    )
  }

  // "Today" = the box-timezone calendar day (fixed Gulf offsets, no DST).
  const offset = TIMEZONE_OFFSETS[box.timezone ?? 'Asia/Dubai'] ?? 4
  const localDay = new Date(Date.now() + offset * 3_600_000).toISOString().slice(0, 10)
  const dayStartUtc = new Date(new Date(`${localDay}T00:00:00Z`).getTime() - offset * 3_600_000).toISOString()
  const dayEndUtc = new Date(new Date(`${localDay}T00:00:00Z`).getTime() - offset * 3_600_000 + 24 * 3_600_000).toISOString()

  const { data: rows } = await supabase
    .from('bookings')
    .select('class_instance_id, checked_in, class_instances!inner(starts_at, status, class_templates(name))')
    .eq('athlete_id', user.id)
    .eq('box_id', box.id)
    .neq('class_instances.status', 'cancelled')
    .gte('class_instances.starts_at', dayStartUtc)
    .lt('class_instances.starts_at', dayEndUtc)

  const nowIso = new Date().toISOString()
  const bookings = ((rows ?? []) as BookingRow[])
    .map((r) => {
      const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
      if (!ci) return null
      const t = Array.isArray(ci.class_templates) ? ci.class_templates[0] : ci.class_templates
      return { instanceId: r.class_instance_id, checkedIn: r.checked_in, startsAt: ci.starts_at, name: t?.name ?? 'Class', window: checkInWindow(ci.starts_at, nowIso) }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return (
    <Shell boxName={box.name}>
      <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 26, letterSpacing: '-0.02em', color: 'var(--c-ink)', marginBottom: 4 }}>
        Hi {profile.full_name?.split(' ')[0] ?? 'there'} 👋
      </h1>
      <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 22 }}>Tap to check into today&apos;s class.</p>

      {bookings.length === 0 ? (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '28px 22px', textAlign: 'center' }}>
          <p style={{ fontSize: 14.5, color: 'var(--c-ink)', fontWeight: 600, marginBottom: 6 }}>Nothing booked today</p>
          <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Book a class first, then scan again to check in.</p>
          <Link href="/dashboard/schedule" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Book a class</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bookings.map((b) => (
            <div key={b.instanceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '16px 18px' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-ink)' }}>{b.name}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 2 }}>{localTime(b.startsAt, offset)}</div>
              </div>
              {b.checkedIn ? (
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>✓ Checked in</span>
              ) : b.window === 'open' ? (
                <CheckInButton instanceId={b.instanceId} />
              ) : b.window === 'early' ? (
                <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>Opens at {localTime(new Date(new Date(b.startsAt).getTime() - 60 * 60_000).toISOString(), offset)}</span>
              ) : (
                <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>Closed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
