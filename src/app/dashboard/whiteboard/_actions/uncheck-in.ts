'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

export async function uncheckIn(
  instanceId: string,
  athleteId: string
): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can change attendance.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()

  // We deliberately do NOT revoke member_achievements here. Streaks/totals are
  // recomputed live from checked_in everywhere except the activity feed (which
  // reads the persisted ledger); the ledger is idempotent and self-heals on the
  // next legitimate check-in, so an undo right after a milestone leaves only a
  // transient feed post — not worth un-awarding a badge that briefly appeared.
  const { error } = await service
    .from('bookings')
    .update({ checked_in: false, checked_in_at: null, overridden_by: null, overridden_reason: null, overridden_at: null })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return actionError('uncheckIn', error)

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
