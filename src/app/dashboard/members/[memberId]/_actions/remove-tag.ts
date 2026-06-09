'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function removeTag(athleteId: string, tag: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) return { error: 'Only staff can tag members.' }

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
