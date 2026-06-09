'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizeTag } from '../_lib/tag'

export async function addTag(athleteId: string, rawTag: string): Promise<{ error: string | null }> {
  const tag = normalizeTag(rawTag)
  if (!tag) return { error: 'Enter a valid tag.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) return { error: 'Only staff can tag members.' }

  const { error } = await supabase.from('member_tags').insert({ box_id: profile.box_id, athlete_id: athleteId, tag })
  if (error && error.code !== '23505') return { error: error.message } // 23505 = already tagged → no-op

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
