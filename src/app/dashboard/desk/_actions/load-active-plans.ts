'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'

export type PlanOption = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null; is_trial: boolean }
type State = { error: string | null; plans?: PlanOption[] }

export async function loadActivePlans(): Promise<State> {
  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { data, error } = await supabase
    .from('membership_plans')
    .select('id, name, monthly_price_aed, provider_plan_ref, is_trial')
    .eq('box_id', profile.box_id)
    .eq('active', true)
    .order('name')
  if (error) return { error: error.message }
  return { error: null, plans: (data ?? []) as PlanOption[] }
}
