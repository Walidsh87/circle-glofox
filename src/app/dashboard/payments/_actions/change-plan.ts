'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function changePlan(membershipId: string, newPlanId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can change plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('name, monthly_price_aed, provider_plan_ref, is_trial')
    .eq('id', newPlanId)
    .eq('box_id', profile.box_id)
    .single()
  if (!plan) return { error: 'Plan not found.' }
  if (plan.is_trial) return { error: "Change to a trial plan isn't supported." }

  // In-place switch — cycle anchor (last_paid_date/start_date), payment_status and end_date untouched.
  const { error } = await supabase
    .from('memberships')
    .update({
      plan_id: newPlanId,
      plan_name: plan.name,
      monthly_price_aed: plan.monthly_price_aed,
      provider_plan_ref: plan.provider_plan_ref,
    })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
  if (error) return { error: 'Could not change the plan.' }

  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
