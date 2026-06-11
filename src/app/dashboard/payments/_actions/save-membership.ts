'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateMembershipInput } from '../_lib/validation'
import { addDays } from '@/lib/date-utils'

type State = { error: string | null }

export async function saveMembership(prevState: State, formData: FormData): Promise<State> {
  const athleteId = formData.get('athleteId') as string
  const planName = (formData.get('planName') as string)?.trim()
  const monthlyPrice = parseFloat(formData.get('monthlyPrice') as string) || null
  const startDate = formData.get('startDate') as string
  const stripePriceId = (formData.get('stripePriceId') as string)?.trim() || null
  const planId = (formData.get('planId') as string)?.trim() || null

  const validationError = validateMembershipInput(athleteId, planName, startDate)
  if (validationError) return { error: validationError }

  const auth = await requireOwnerAction('Only owners can manage memberships.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  // A trial plan creates a time-limited membership; fields derived server-side from the
  // authoritative plan (the form can't forge a trial length).
  let endDate: string | null = null
  let isTrial = false
  let trialPaymentStatus: 'paid' | 'unpaid' | null = null
  if (planId) {
    const { data: plan } = await supabase
      .from('membership_plans')
      .select('monthly_price_aed, is_trial, trial_days')
      .eq('id', planId)
      .eq('box_id', profile.box_id)
      .single()
    if (plan?.is_trial && plan.trial_days) {
      isTrial = true
      endDate = addDays(startDate, plan.trial_days)
      trialPaymentStatus = (plan.monthly_price_aed == null || Number(plan.monthly_price_aed) === 0) ? 'paid' : 'unpaid'
    }
  }

  const { error } = await supabase.from('memberships').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    plan_name: planName,
    monthly_price_aed: monthlyPrice,
    start_date: startDate,
    payment_status: trialPaymentStatus ?? 'unpaid',
    is_trial: isTrial,
    ...(endDate ? { end_date: endDate } : {}),
    ...(stripePriceId ? { provider_plan_ref: stripePriceId } : {}),
    ...(planId ? { plan_id: planId } : {}),
  })

  if (error) {
    console.error('saveMembership insert failed:', error)
    return { error: 'Could not save the membership.' }
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
