'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateMembershipInput } from '../_lib/validation'
import { assignMembershipCore } from '@/lib/memberships'

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

  const { error } = await assignMembershipCore(supabase, {
    boxId: profile.box_id,
    athleteId,
    planName,
    monthlyPrice,
    startDate,
    planId,
    stripePriceId,
  })
  if (error) return { error }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
