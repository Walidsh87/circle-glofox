'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function saveBookingPolicy(closeMinutes: number, lateCancelHours: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(closeMinutes) || closeMinutes < 0 || !Number.isInteger(lateCancelHours) || lateCancelHours < 0) {
    return { error: 'Policies must be whole numbers of zero or more.' }
  }
  const auth = await requireOwnerAction('Only owners can update settings.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()
  const { error } = await service.from('boxes').update({ booking_close_minutes: closeMinutes, late_cancel_hours: lateCancelHours }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
