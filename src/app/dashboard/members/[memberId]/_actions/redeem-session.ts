'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateRedeemInput } from '../_lib/validation'

export async function redeemSession(creditId: string): Promise<{ error: string | null }> {
  const validationError = validateRedeemInput(creditId)
  if (validationError) return { error: validationError }

  const auth = await requireOwnerAction('Only owners can redeem sessions.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()

  // The batch must be a PT-session batch in the owner's box (tenant scope).
  const { data: batch } = await service
    .from('package_credits')
    .select('id, athlete_id, kind, credits_remaining')
    .eq('id', creditId)
    .eq('box_id', profile.box_id)
    .eq('kind', 'pt_session')
    .maybeSingle()
  if (!batch) return { error: 'PT credit batch not found.' }
  if (batch.credits_remaining < 1) return { error: 'No sessions left in this batch.' }

  const { data: remaining, error } = await service.rpc('consume_credit', { p_credit_id: creditId })
  if (error || remaining === null || remaining === undefined) {
    return { error: 'Could not redeem a session. Please try again.' }
  }

  revalidatePath(`/dashboard/members/${batch.athlete_id}`)
  return { error: null }
}
