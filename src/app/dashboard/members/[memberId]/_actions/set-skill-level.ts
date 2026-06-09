'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BELTS, SKILL_KEYS } from '@/lib/skills'

export async function setSkillLevel(athleteId: string, skillKey: string, belt: string): Promise<{ error: string | null }> {
  if (!SKILL_KEYS.has(skillKey)) return { error: 'Unknown skill.' }
  if (belt !== '' && !(BELTS as readonly string[]).includes(belt)) return { error: 'Unknown belt.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) return { error: 'Only staff can set skill levels.' }

  if (belt === '') {
    const { error } = await supabase.from('skill_levels').delete().eq('athlete_id', athleteId).eq('skill_key', skillKey).eq('box_id', profile.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('skill_levels').upsert(
      { box_id: profile.box_id, athlete_id: athleteId, skill_key: skillKey, belt, updated_at: new Date().toISOString() },
      { onConflict: 'athlete_id,skill_key' },
    )
    if (error) return { error: error.message }
  }

  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/skills')
  return { error: null }
}
