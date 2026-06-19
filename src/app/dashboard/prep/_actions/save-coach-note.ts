'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateCoachNote } from '../_lib/validation'

export async function saveCoachNote(athleteId: string, note: string): Promise<{ error: string | null }> {
  const validationError = validateCoachNote(note)
  if (validationError) return { error: validationError }

  const auth = await requireStaffAction('Only owners and coaches can edit coaching notes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const trimmed = note.trim()
  if (trimmed === '') {
    const { error } = await supabase
      .from('athlete_coach_notes')
      .delete()
      .eq('box_id', profile.box_id)
      .eq('athlete_id', athleteId)
    if (error) return actionError('saveCoachNote', error)
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
    if (error) return actionError('saveCoachNote', error)
  }

  revalidatePath('/dashboard/prep')
  return { error: null }
}
