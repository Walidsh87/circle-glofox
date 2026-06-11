'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function joinWaitlist(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

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
  const service = createServiceClient()

  // Waitlist only makes sense once the class is full (service role counts everyone).
  const { count } = await service
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', instanceId)
  if ((count ?? 0) < instance.capacity) return { error: "This class isn't full — you can book it directly." }

  const { data: existing } = await service
    .from('bookings')
    .select('id')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .maybeSingle()
  if (existing) return { error: "You're already booked." }

  // Athlete inserts their own row via the RLS client.
  const { error } = await supabase.from('class_waitlist').insert({
    box_id: profile.box_id,
    class_instance_id: instanceId,
    athlete_id: user.id,
  })
  if (error) {
    if (error.code === '23505') return { error: "You're already on the waitlist." }
    return { error: error.message }
  }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
