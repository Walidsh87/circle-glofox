'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function clearDay(date: string): Promise<{ error: string | null }> {
  if (!DATE_RE.test(date ?? '')) return { error: 'Invalid date.' }

  const auth = await requireProgrammingAction('Only owners and coaches can program WODs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { data: workout } = await supabase
    .from('workouts')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('date', date)
    .maybeSingle()
  if (!workout) return { error: null } // nothing to clear

  // Deleting a workout cascades to workout_scores — refuse if any results exist.
  // This count-then-delete narrows but doesn't fully close the window: a score
  // logged between the count and the delete would still be cascade-deleted.
  // Accepted at this stage (staff-only path; fully closing it needs a
  // transactional RPC). Revisit if athletes report lost scores.
  const { count } = await supabase
    .from('workout_scores')
    .select('id', { count: 'exact', head: true })
    .eq('workout_id', workout.id)
  if ((count ?? 0) > 0) {
    return { error: 'Athletes have logged scores for this day — clear those first or keep the WOD.' }
  }

  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workout.id)
    .eq('box_id', profile.box_id)
  if (error) return actionError('clearDay', error)

  revalidatePath('/dashboard/programming')
  revalidatePath('/dashboard/wod')
  return { error: null }
}
