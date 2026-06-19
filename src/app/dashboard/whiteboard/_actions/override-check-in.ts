'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { awardConsistency } from './_award'
import { actionError } from '@/lib/action-error'

const overrideSchema = z.object({
  instanceId: z.string().min(1),
  athleteId:  z.string().min(1),
  reason:     z.string().min(1).max(200),
})

export async function overrideCheckIn(
  instanceId: string,
  athleteId: string,
  reason: string
): Promise<{ error: string | null }> {
  const parsed = overrideSchema.safeParse({ instanceId, athleteId, reason })
  if (!parsed.success) return { error: 'Invalid input.' }

  const auth = await requireStaffAction('Only staff can override check-in.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  const service = createServiceClient()

  const now = new Date().toISOString()
  const { error } = await service
    .from('bookings')
    .update({
      checked_in: true,
      checked_in_at: now,
      overridden_by: user.id,
      overridden_reason: parsed.data.reason,
      overridden_at: now,
    })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return actionError('overrideCheckIn', error)

  try { await awardConsistency(service, profile.box_id, athleteId, now.slice(0, 10)) }
  catch (e) { console.error('awardConsistency failed (override still succeeded):', e) }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
