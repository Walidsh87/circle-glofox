'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function toggleMembershipPlan(planId: string, active: boolean): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('membership_plans')
    .update({ active })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) return actionError('toggleMembershipPlan', error)

  revalidatePath('/dashboard/payments')
  return { error: null }
}
