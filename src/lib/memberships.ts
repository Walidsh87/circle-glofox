import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays } from '@/lib/date-utils'

export type AssignMembershipInput = {
  boxId: string
  athleteId: string
  planName: string
  monthlyPrice: number | null
  startDate: string
  planId?: string | null
  stripePriceId?: string | null
}

/**
 * Core membership assignment, incl. trial derivation from the authoritative plan
 * (a trial plan → end_date = start + trial_days; free trial → paid/access, priced
 * intro → unpaid). Box-pinned. The CALLER authorizes + validates. `client` may be
 * the RLS (owner) or service-role (desk) client — both box-scope by .eq.
 */
export async function assignMembershipCore(client: SupabaseClient, input: AssignMembershipInput): Promise<{ error: string | null }> {
  let endDate: string | null = null
  let isTrial = false
  let trialPaymentStatus: 'paid' | 'unpaid' | null = null
  if (input.planId) {
    const { data: plan } = await client
      .from('membership_plans')
      .select('monthly_price_aed, is_trial, trial_days')
      .eq('id', input.planId)
      .eq('box_id', input.boxId)
      .single()
    if (plan?.is_trial && plan.trial_days) {
      isTrial = true
      endDate = addDays(input.startDate, plan.trial_days)
      trialPaymentStatus = (plan.monthly_price_aed == null || Number(plan.monthly_price_aed) === 0) ? 'paid' : 'unpaid'
    }
  }

  const { error } = await client.from('memberships').insert({
    box_id: input.boxId,
    athlete_id: input.athleteId,
    plan_name: input.planName,
    monthly_price_aed: input.monthlyPrice,
    start_date: input.startDate,
    payment_status: trialPaymentStatus ?? 'unpaid',
    is_trial: isTrial,
    ...(endDate ? { end_date: endDate } : {}),
    ...(input.stripePriceId ? { provider_plan_ref: input.stripePriceId } : {}),
    ...(input.planId ? { plan_id: input.planId } : {}),
  })
  if (error) {
    console.error('assignMembershipCore insert failed:', error)
    return { error: 'Could not save the membership.' }
  }
  return { error: null }
}
