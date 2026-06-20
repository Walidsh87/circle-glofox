'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { todayWindow } from '@/lib/timezone'

export type MemberContext = {
  membership: { id: string; plan_name: string; monthly_price_aed: number | null; payment_status: string; provider_plan_ref: string | null } | null
  todayBookings: { bookingId: string; instanceId: string; className: string; startsAt: string; checkedIn: boolean }[]
}
type State = { error: string | null; ctx?: MemberContext }

export async function loadMemberContext(athleteId: string): Promise<State> {
  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth
  const service = createServiceClient()

  // Active membership (most recent by start_date)
  const { data: mem } = await service
    .from('memberships')
    .select('id, plan_name, monthly_price_aed, payment_status, provider_plan_ref, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)
    .order('start_date', { ascending: false })
    .limit(1)
  const membership = mem?.[0] ?? null

  // Gym timezone for the correct "today" window
  const { data: box } = await service
    .from('boxes')
    .select('timezone')
    .eq('id', profile.box_id)
    .single()
  const timezone = (box as { timezone?: string } | null)?.timezone ?? 'Asia/Dubai'
  const { start, end } = todayWindow(timezone)

  // Bookings today: filter via class_instances.starts_at window (no class_date column).
  // The join mirrors what the whiteboard uses: class_instances(id, starts_at, class_templates(name)).
  const { data: bookings } = await service
    .from('bookings')
    .select('id, checked_in, class_instances!inner(id, starts_at, class_templates(name))')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)
    .gte('class_instances.starts_at', start)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .lte('class_instances.starts_at' as any, end)

  const todayBookings = (bookings ?? []).map((b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ci = (b as any).class_instances
    const tmpl = Array.isArray(ci?.class_templates) ? ci.class_templates[0] : ci?.class_templates
    return {
      bookingId: b.id as string,
      instanceId: (ci?.id ?? '') as string,
      className: (tmpl?.name ?? 'Class') as string,
      startsAt: (ci?.starts_at ?? '') as string,
      checkedIn: !!(b as { checked_in?: boolean }).checked_in,
    }
  })

  return { error: null, ctx: { membership: membership as MemberContext['membership'], todayBookings } }
}
