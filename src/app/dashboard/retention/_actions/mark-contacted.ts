'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function markContacted(athleteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only owners and coaches can log outreach.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('member_outreach').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    contacted_by: user.id,
  })
  if (error) return actionError('markContacted', error)

  revalidatePath('/dashboard/retention')
  return { error: null }
}
