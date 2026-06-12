import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { GymLoginForm } from '@/app/[gymSlug]/_components/gym-login-form'
import { CircleMark } from '@/components/circle-mark'
import { checkInWindow } from '@/lib/self-checkin'
import { CheckInButton } from '../_components/check-in-button'
import { TIMEZONE_OFFSETS } from '@/lib/timezone'

export const dynamic = 'force-dynamic'

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
    <div className="theme-dark flex min-h-screen justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-[26px] flex items-center gap-[9px] font-display text-[17px] font-bold uppercase tracking-[0.04em] text-ink">
          <CircleMark size={22} onDark />
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
    // Kiosk is pinned dark even for the login step (spec: check-in always dark).
    return (
      <div className="theme-dark" style={{ display: 'contents' }}>
        <GymLoginForm gymName={box.name} gymSlug={box.slug ?? ''} redirectTo={`/checkin/${token}`} />
      </div>
    )
  }

  const { data: profile } = await supabase.from('profiles').select('box_id, full_name').eq('id', user.id).single()
  if (!profile || profile.box_id !== box.id) {
    return (
      <Shell boxName={box.name}>
        <h1 className="mb-2 font-display text-2xl text-ink">Wrong gym</h1>
        <p className="text-sm text-ink-3">This QR belongs to another gym.</p>
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
      <h1 className="mb-1 font-display text-[26px] tracking-[-0.02em] text-ink">
        Hi {profile.full_name?.split(' ')[0] ?? 'there'} 👋
      </h1>
      <p className="mb-[22px] text-sm text-ink-3">Tap to check into today&apos;s class.</p>

      {bookings.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface px-[22px] py-7 text-center">
          <p className="mb-1.5 text-[14.5px] font-semibold text-ink">Nothing booked today</p>
          <p className="mb-4 text-[13px] text-ink-3">Book a class first, then scan again to check in.</p>
          <Link href="/dashboard/schedule" className="inline-block rounded-[10px] bg-accent px-[18px] py-2.5 text-[13.5px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover">
            Book a class
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {bookings.map((b) => (
            <div key={b.instanceId} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-[18px] py-4">
              <div>
                <div className="text-[15px] font-semibold text-ink">{b.name}</div>
                <div className="mt-0.5 font-mono text-xs text-ink-3">{localTime(b.startsAt, offset)}</div>
              </div>
              {b.checkedIn ? (
                <span className="text-[13.5px] font-bold text-accent-ink">✓ Checked in</span>
              ) : b.window === 'open' ? (
                <CheckInButton instanceId={b.instanceId} />
              ) : b.window === 'early' ? (
                <span className="text-[12.5px] text-ink-3">Opens at {localTime(new Date(new Date(b.startsAt).getTime() - 60 * 60_000).toISOString(), offset)}</span>
              ) : (
                <span className="text-[12.5px] text-ink-3">Closed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
