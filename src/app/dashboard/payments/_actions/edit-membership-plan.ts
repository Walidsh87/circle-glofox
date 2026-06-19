'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validatePlan } from '../_lib/plan-validation'

export async function editMembershipPlan(
  planId: string,
  name: string,
  monthlyPriceAed: number | null,
  providerPlanRef: string | null,
  isTrial: boolean = false,
  trialDays: number | null = null,
): Promise<{ error: string | null }> {
  const err = validatePlan(name, monthlyPriceAed, providerPlanRef, isTrial, trialDays)
  if (err) return { error: err }

  const auth = await requireOwnerAction('Only owners can manage plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('membership_plans')
    .update({ name: name.trim(), monthly_price_aed: monthlyPriceAed, provider_plan_ref: providerPlanRef, is_trial: isTrial, trial_days: isTrial ? trialDays : null })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) return actionError('editMembershipPlan', error)

  revalidatePath('/dashboard/payments')
  return { error: null }
}
