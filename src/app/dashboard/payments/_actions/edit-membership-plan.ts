'use server'

import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase
    .from('membership_plans')
    .update({ name: name.trim(), monthly_price_aed: monthlyPriceAed, provider_plan_ref: providerPlanRef, is_trial: isTrial, trial_days: isTrial ? trialDays : null })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
