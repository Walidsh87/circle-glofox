'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateSetEntries, isValidPerformedOn, kgToGrams, type SetEntry } from '@/lib/program-log'

// The member logs their OWN sets. RLS (set_logs_athlete_own = athlete_id = auth.uid())
// is the real guard; we additionally confirm the exercise is theirs (athlete_read RLS
// only returns their own program_exercises) to source a trusted box_id.
export async function logSets(exerciseId: string, performedOn: string, entries: SetEntry[]): Promise<{ error: string | null }> {
  if (!isValidPerformedOn(performedOn)) return { error: 'Pick a valid date.' }
  const err = validateSetEntries(entries)
  if (err) return { error: err }

  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: ex } = await supabase.from('program_exercises').select('id, box_id, athlete_id').eq('id', exerciseId).maybeSingle()
  if (!ex || (ex as { athlete_id: string }).athlete_id !== user.id) return { error: 'Exercise not found.' }
  const boxId = (ex as { box_id: string }).box_id

  const rows = entries.map((e) => ({
    box_id: boxId,
    athlete_id: user.id,
    exercise_id: exerciseId,
    performed_on: performedOn,
    set_number: e.setNumber,
    weight_grams: e.weightKg != null ? kgToGrams(e.weightKg) : null,
    reps: e.reps ?? null,
  }))
  const { error } = await supabase.from('program_set_logs').upsert(rows, { onConflict: 'exercise_id,athlete_id,performed_on,set_number' })
  if (error) return actionError('logSets', error)

  revalidatePath('/dashboard/program')
  return { error: null }
}

export async function deleteSetDay(exerciseId: string, performedOn: string): Promise<{ error: string | null }> {
  if (!isValidPerformedOn(performedOn)) return { error: 'Pick a valid date.' }
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  // Confirm the exercise is the athlete's own (athlete_read RLS) + source box_id —
  // matches logSets and keeps the delete box-scoped at the app layer too.
  const { data: ex } = await supabase.from('program_exercises').select('box_id, athlete_id').eq('id', exerciseId).maybeSingle()
  if (!ex || (ex as { athlete_id: string }).athlete_id !== user.id) return { error: 'Exercise not found.' }

  const { error } = await supabase
    .from('program_set_logs')
    .delete()
    .eq('exercise_id', exerciseId)
    .eq('athlete_id', user.id)
    .eq('box_id', (ex as { box_id: string }).box_id)
    .eq('performed_on', performedOn)
  if (error) return actionError('deleteSetDay', error)

  revalidatePath('/dashboard/program')
  return { error: null }
}
