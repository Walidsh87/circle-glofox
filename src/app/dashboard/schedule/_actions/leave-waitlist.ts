'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

export async function leaveWaitlist(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('class_waitlist')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
  if (error) return actionError('leaveWaitlist', error)

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
