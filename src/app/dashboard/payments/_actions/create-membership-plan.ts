'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validatePlan } from '../_lib/plan-validation'

type State = { error: string | null }

export async function createMembershipPlan(prevState: State, formData: FormData): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const priceRaw = (formData.get('monthlyPrice') as string)?.trim()
  const monthlyPrice = priceRaw ? parseFloat(priceRaw) : null
  const providerPlanRef = (formData.get('providerPlanRef') as string)?.trim() || null
  const isTrial = formData.get('isTrial') === 'on'
  const trialRaw = (formData.get('trialDays') as string)?.trim()
  const trialDays = isTrial && trialRaw ? parseInt(trialRaw) : null

  const err = validatePlan(name, monthlyPrice, providerPlanRef, isTrial, trialDays)
  if (err) return { error: err }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase.from('membership_plans').insert({
    box_id: profile.box_id,
    name,
    monthly_price_aed: monthlyPrice,
    provider_plan_ref: providerPlanRef,
    is_trial: isTrial,
    trial_days: trialDays,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
