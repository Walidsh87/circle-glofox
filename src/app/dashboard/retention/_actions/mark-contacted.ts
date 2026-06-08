'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markContacted(athleteId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can log outreach.' }
  }

  const { error } = await supabase.from('member_outreach').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    contacted_by: user.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/retention')
  return { error: null }
}
