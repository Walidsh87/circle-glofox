'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const overrideSchema = z.object({
  instanceId: z.string().uuid(),
  athleteId:  z.string().uuid(),
  reason:     z.string().min(1).max(200),
})

export async function overrideCheckIn(
  instanceId: string,
  athleteId: string,
  reason: string
): Promise<{ error: string | null }> {
  const parsed = overrideSchema.safeParse({ instanceId, athleteId, reason })
  if (!parsed.success) return { error: 'Invalid input.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only staff can override check-in.' }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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

  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
