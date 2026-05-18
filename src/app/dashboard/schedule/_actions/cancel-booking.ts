'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function cancelBooking(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // athlete_book RLS policy covers delete for own bookings
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
