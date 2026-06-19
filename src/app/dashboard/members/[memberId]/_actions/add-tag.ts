'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { normalizeTag } from '../_lib/tag'

export async function addTag(athleteId: string, rawTag: string): Promise<{ error: string | null }> {
  const tag = normalizeTag(rawTag)
  if (!tag) return { error: 'Enter a valid tag.' }

  const auth = await requireStaffAction('Only staff can tag members.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('member_tags').insert({ box_id: profile.box_id, athlete_id: athleteId, tag })
  if (error && error.code !== '23505') return actionError('addTag', error) // 23505 = already tagged → no-op

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
