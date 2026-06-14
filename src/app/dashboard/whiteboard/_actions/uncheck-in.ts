'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function uncheckIn(
  instanceId: string,
  athleteId: string
): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can change attendance.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()

  const { error } = await service
    .from('bookings')
    .update({ checked_in: false, checked_in_at: null })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
