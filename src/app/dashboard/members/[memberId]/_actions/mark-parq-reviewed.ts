'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function markParqReviewed(athleteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can review PAR-Q responses.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile: caller } = auth

  // No UPDATE RLS on parq_responses — clearance is service-role with code rails.
  const service = createServiceClient()
  const { data: latest } = await service
    .from('parq_responses')
    .select('id, has_yes, reviewed_at')
    .eq('athlete_id', athleteId)
    .eq('box_id', caller.box_id)
    .order('parq_version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest || !latest.has_yes) return { error: 'Nothing to review.' }
  if (latest.reviewed_at) return { error: 'Already reviewed.' }

  const { error } = await service
    .from('parq_responses')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', latest.id)
    .eq('box_id', caller.box_id)
  if (error) return actionError('markParqReviewed', error)
  revalidatePath(`/dashboard/members/${athleteId}`)
  return { error: null }
}
