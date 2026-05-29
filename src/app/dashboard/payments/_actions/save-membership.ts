'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateMembershipInput } from '../_lib/validation'

export { validateMembershipInput }

type State = { error: string | null }

export async function saveMembership(prevState: State, formData: FormData): Promise<State> {
  const athleteId = formData.get('athleteId') as string
  const planName = (formData.get('planName') as string)?.trim()
  const monthlyPrice = parseFloat(formData.get('monthlyPrice') as string) || null
  const startDate = formData.get('startDate') as string
  const stripePriceId = (formData.get('stripePriceId') as string)?.trim() || null

  const validationError = validateMembershipInput(athleteId, planName, startDate)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage memberships.' }

  const { error } = await supabase.from('memberships').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    plan_name: planName,
    monthly_price_aed: monthlyPrice,
    start_date: startDate,
    payment_status: 'unpaid',
    ...(stripePriceId ? { provider_plan_ref: stripePriceId } : {}),
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
