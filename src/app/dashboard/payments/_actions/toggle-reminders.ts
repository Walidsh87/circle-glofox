'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function toggleReminders(enabled: boolean): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can change this setting.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('boxes')
    .update({ reminders_enabled: enabled })
    .eq('id', profile.box_id)

  if (error) {
    console.error('toggleReminders update failed:', error)
    return { error: 'Could not update the reminders setting.' }
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
