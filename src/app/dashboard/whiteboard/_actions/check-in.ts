'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getMembershipStatus, type MembershipStatus } from '@/lib/membership-status'

type CheckInResult = {
  error: string | null
  blocked?: {
    reason: Exclude<MembershipStatus, 'paid'>
    lastPaidDate: string | null
  }
}

export async function checkIn(
  instanceId: string,
  athleteId: string
): Promise<CheckInResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only staff can check in athletes.' }
  }

  const { data: memberships } = await supabase
    .from('memberships')
    .select('payment_status, end_date, last_paid_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  const today = new Date().toISOString().slice(0, 10)
  const status = getMembershipStatus(memberships ?? [], today)

  if (status !== 'paid') {
    const lastPaidDate = (memberships ?? [])
      .map((m) => m.last_paid_date)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null
    return { error: 'BLOCKED', blocked: { reason: status, lastPaidDate } }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
