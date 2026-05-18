'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function removeMember(memberId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  if (memberId === user.id) return { error: 'You cannot remove yourself.' }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'owner') return { error: 'Only owners can remove members.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify the member belongs to the same box
  const { data: memberProfile } = await service
    .from('profiles')
    .select('box_id')
    .eq('id', memberId)
    .single()

  if (!memberProfile || memberProfile.box_id !== callerProfile.box_id) {
    return { error: 'Member not found.' }
  }

  // Delete profile first (cascades memberships, bookings, scores, lifts)
  const { error: profileDeleteError } = await service.from('profiles').delete().eq('id', memberId)
  if (profileDeleteError) return { error: profileDeleteError.message }

  // Delete auth user only after profile is confirmed deleted
  const { error: authDeleteError } = await service.auth.admin.deleteUser(memberId)
  if (authDeleteError) return { error: authDeleteError.message }

  revalidatePath('/dashboard/members')
  return { error: null }
}
