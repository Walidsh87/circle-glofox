'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function deleteMembershipPlan(planId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('membership_plans')
    .delete()
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) {
    // memberships.plan_id FK (RESTRICT) blocks deletion once the plan is in use.
    if (error.code === '23503') return { error: 'Cannot delete: this plan is in use. Deactivate it instead.' }
    return actionError('deleteMembershipPlan', error)
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
