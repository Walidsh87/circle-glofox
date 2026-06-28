'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function removeMember(memberId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  if (memberId === user.id) return { error: 'You cannot remove yourself.' }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('box_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'owner') return { error: 'Only owners can remove members.' }

  const service = createServiceClient()

  // Verify the member belongs to the same box
  const { data: memberProfile } = await service
    .from('profiles')
    .select('box_id, full_name, role')
    .eq('id', memberId)
    .single()

  if (!memberProfile || memberProfile.box_id !== callerProfile.box_id) {
    return { error: 'Member not found.' }
  }

  // Delete profile first. Every FK referencing profiles has a deliberate ON DELETE
  // rule (migration 088): CASCADE for the member's own data, SET NULL for authorship/
  // actor refs — so this delete is never blocked by a child row (was bug 2026-06-28).
  const { error: profileDeleteError } = await service.from('profiles').delete().eq('id', memberId)
  if (profileDeleteError) return actionError('removeMember', profileDeleteError)

  // Delete auth user only after profile is confirmed deleted
  const { error: authDeleteError } = await service.auth.admin.deleteUser(memberId)
  if (authDeleteError) {
    // The profile (and its cascades) is already gone but the auth account survived → the user would
    // land in a permanent onboarding loop. Log the uid so it can be cleaned up in the Supabase dashboard.
    console.error('[removeMember] profile deleted but auth.admin.deleteUser failed — orphaned auth uid:', memberId, authDeleteError)
    return actionError('removeMember', authDeleteError)
  }

  await logAudit(service, {
    boxId: callerProfile.box_id,
    actorId: user.id,
    actorName: callerProfile.full_name ?? null,
    action: 'member.remove',
    target: memberProfile.full_name ?? 'Member',
    details: { role: memberProfile.role },
  })

  revalidatePath('/dashboard/members')
  return { error: null }
}
