'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateCoachNote } from '../_lib/validation'

export async function saveCoachNote(athleteId: string, note: string): Promise<{ error: string | null }> {
  const validationError = validateCoachNote(note)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can edit coaching notes.' }
  }

  const trimmed = note.trim()
  if (trimmed === '') {
    const { error } = await supabase
      .from('athlete_coach_notes')
      .delete()
      .eq('box_id', profile.box_id)
      .eq('athlete_id', athleteId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('athlete_coach_notes').upsert(
      {
        box_id: profile.box_id,
        athlete_id: athleteId,
        note: trimmed,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'box_id,athlete_id' }
    )
    if (error) return { error: error.message }
  }

  revalidatePath('/dashboard/prep')
  return { error: null }
}
