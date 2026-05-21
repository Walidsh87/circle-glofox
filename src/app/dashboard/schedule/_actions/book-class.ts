'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function bookClass(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Use RLS client — box_id match is enforced by policy, no manual check needed
  const { data: instance } = await supabase
    .from('class_instances')
    .select('capacity, box_id')
    .eq('id', instanceId)
    .single()

  if (!instance) return { error: 'Class not found.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.' }
  if (instance.box_id !== profile.box_id) return { error: 'Class not found.' }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }

  // Count all bookings for this class (requires service key to bypass athlete RLS)
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { count } = await service
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', instanceId)

  if ((count ?? 0) >= instance.capacity) return { error: 'Class is full.' }

  const { error } = await supabase.from('bookings').insert({
    box_id: profile.box_id,
    class_instance_id: instanceId,
    athlete_id: user.id,
  })

  if (error) {
    if (error.code === '23505') return { error: 'Already booked.' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
