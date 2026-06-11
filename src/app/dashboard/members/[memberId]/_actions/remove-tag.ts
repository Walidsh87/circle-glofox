'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function removeTag(athleteId: string, tag: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can tag members.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('member_tags')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('tag', tag)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
