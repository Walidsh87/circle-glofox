'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { BELTS, SKILL_KEYS } from '@/lib/skills'

export async function setSkillLevel(athleteId: string, skillKey: string, belt: string): Promise<{ error: string | null }> {
  if (!SKILL_KEYS.has(skillKey)) return { error: 'Unknown skill.' }
  if (belt !== '' && !(BELTS as readonly string[]).includes(belt)) return { error: 'Unknown belt.' }

  const auth = await requireStaffAction('Only staff can set skill levels.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

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
