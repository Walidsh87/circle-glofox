import type { StaffActionContext } from '@/lib/auth/action-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'

/** Authorize managing `coachId`'s availability/time-off.
 *  Allowed if the caller IS that coach (self) or a manager. The target must be a
 *  `role='coach'` profile in the caller's box. Returns the error, or whether the
 *  caller is a manager (used to decide auto-approval). */
export async function resolveCoachTarget(
  { supabase, user, profile }: StaffActionContext,
  coachId: string,
): Promise<{ error: string } | { manager: boolean }> {
  const manager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  if (coachId !== user.id && !manager) return { error: 'You can only manage your own availability.' }

  const { data: coach } = await supabase
    .from('profiles').select('role')
    .eq('id', coachId).eq('box_id', profile.box_id).maybeSingle()
  if (!coach || (coach as { role: string }).role !== 'coach') return { error: 'Coach not found in your gym.' }

  return { manager }
}
