'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { validateRedeemInput } from '../_lib/validation'

export async function redeemSession(creditId: string): Promise<{ error: string | null }> {
  const validationError = validateRedeemInput(creditId)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can redeem sessions.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

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
