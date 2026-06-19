'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

const ASSIGNABLE_ROLES = ['admin', 'coach', 'receptionist']

export async function changeStaffRole(profileId: string, role: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can change staff roles.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile: caller } = auth

  if (!ASSIGNABLE_ROLES.includes(role)) return { error: 'Invalid role.' }
  if (profileId === user.id) return { error: 'You cannot change your own role.' }

  const service = createServiceClient()
  const { data: target } = await service.from('profiles').select('role, full_name').eq('id', profileId).eq('box_id', caller.box_id).maybeSingle()
  if (!target) return { error: 'Staff member not found in your gym.' }
  if (target.role === 'owner') return { error: 'You cannot change the owner role.' }
  if (target.role === 'athlete') return { error: 'Members cannot be given staff roles here.' }

  const { error } = await service.from('profiles').update({ role }).eq('id', profileId).eq('box_id', caller.box_id)
  if (error) return actionError('changeStaffRole', error)

  await logAudit(service, {
    boxId: caller.box_id,
    actorId: user.id,
    actorName: caller.full_name ?? null,
    action: 'staff.role_change',
    target: target.full_name ?? 'Staff member',
    details: { from: target.role, to: role },
  })

  revalidatePath('/dashboard/members')
  return { error: null }
}
