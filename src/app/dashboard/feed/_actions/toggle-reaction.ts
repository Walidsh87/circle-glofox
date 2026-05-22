'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleReaction(scoreId: string): Promise<{ error: string | null; count: number; reacted: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', count: 0, reacted: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.', count: 0, reacted: false }

  const { data: existing } = await supabase
    .from('score_reactions')
    .select('id')
    .eq('score_id', scoreId)
    .eq('athlete_id', user.id)
    .single()

  if (existing) {
    await supabase.from('score_reactions').delete().eq('id', existing.id)
  } else {
    await supabase.from('score_reactions').insert({
      box_id: profile.box_id,
      score_id: scoreId,
      athlete_id: user.id,
    })
  }

  const { count } = await supabase
    .from('score_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('score_id', scoreId)

  revalidatePath('/dashboard/feed')
  return { error: null, count: count ?? 0, reacted: !existing }
}
