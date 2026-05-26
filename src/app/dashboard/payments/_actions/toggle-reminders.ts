'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleReminders(enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can change this setting.' }

  const { error } = await supabase
    .from('boxes')
    .update({ reminders_enabled: enabled })
    .eq('id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
