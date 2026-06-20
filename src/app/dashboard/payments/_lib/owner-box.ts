import { requireOwnerAction } from '@/lib/auth/action-guards'

/** Owner guard for membership-management actions: returns the owner's box id or an error. */
export async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const auth = await requireOwnerAction('Only owners can manage memberships.')
  if ('error' in auth) return { error: auth.error }
  return { boxId: auth.profile.box_id }
}
