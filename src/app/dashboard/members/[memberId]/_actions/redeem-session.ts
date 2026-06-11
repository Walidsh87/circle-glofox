'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateRedeemInput } from '../_lib/validation'

export async function redeemSession(creditId: string, coachId: string): Promise<{ error: string | null }> {
  const validationError = validateRedeemInput(creditId)
  if (validationError) return { error: validationError }
  if (!coachId) return { error: 'Pick the coach who delivered the session.' }

  const auth = await requireOwnerAction('Only owners can redeem sessions.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  const service = createServiceClient()

  // The attributed coach must be a coach in the owner's box (payroll #55).
  const { data: coachRow } = await service
    .from('profiles')
    .select('id, role')
    .eq('id', coachId)
    .eq('box_id', profile.box_id)
    .eq('role', 'coach')
    .maybeSingle()
  if (!coachRow) return { error: 'Coach not found in your gym.' }

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

  // Attribution log (#55): one row per delivered session, only after a successful consume.
  await service.from('pt_sessions').insert({
    box_id: profile.box_id,
    coach_id: coachId,
    athlete_id: batch.athlete_id,
    credit_id: creditId,
    redeemed_by: user.id,
  })

  revalidatePath(`/dashboard/members/${batch.athlete_id}`)
  return { error: null }
}
