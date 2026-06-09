'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function saveBookingPolicy(closeMinutes: number, lateCancelHours: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(closeMinutes) || closeMinutes < 0 || !Number.isInteger(lateCancelHours) || lateCancelHours < 0) {
    return { error: 'Policies must be whole numbers of zero or more.' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can update settings.' }

  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await service.from('boxes').update({ booking_close_minutes: closeMinutes, late_cancel_hours: lateCancelHours }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
