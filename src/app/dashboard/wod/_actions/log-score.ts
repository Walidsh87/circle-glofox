'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { decideWodPr } from '../_lib/pr'

export type WodPrInfo = { benchmark: string; rx: boolean; scoringType: string; newScore: number; prevBest: number }
type State = { error: string | null; pr: WodPrInfo | null }

// Escape ILIKE wildcards so a title is matched literally (case-insensitive).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export async function logScore(prevState: State, formData: FormData): Promise<State> {
  const workoutId = formData.get('workoutId') as string
  const scoreValue = parseFloat(formData.get('scoreValue') as string)
  const rx = formData.get('rx') === 'on'
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!workoutId || isNaN(scoreValue) || scoreValue < 0) {
    return { error: 'Enter a valid score.', pr: null }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', pr: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.', pr: null }

  const { data: workout } = await supabase
    .from('workouts')
    .select('title, scoring_type')
    .eq('id', workoutId)
    .single()
  if (!workout) return { error: 'Workout not found.', pr: null }

  // Prior scores on the SAME benchmark (title, case-insensitive) in the SAME rx
  // bracket — one joined query (workout_scores → workouts), this workout excluded in JS.
  const { data: priors } = await supabase
    .from('workout_scores')
    .select('score_value, workout_id, workouts!inner(title)')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .eq('rx', rx)
    .ilike('workouts.title', escapeLike(workout.title))

  const priorScores = ((priors ?? []) as { score_value: number; workout_id: string }[])
    .filter((p) => p.workout_id !== workoutId)
    .map((p) => p.score_value)

  const { isPr, prevBest } = decideWodPr(workout.scoring_type, scoreValue, priorScores)

  const { error } = await supabase.from('workout_scores').upsert(
    {
      box_id: profile.box_id,
      workout_id: workoutId,
      athlete_id: user.id,
      score_value: scoreValue,
      rx,
      notes,
      is_pr: isPr,
    },
    { onConflict: 'workout_id,athlete_id' }
  )

  if (error) {
    console.error('[logScore]', error)
    return { error: 'Could not log your score.', pr: null }
  }

  revalidatePath('/dashboard/wod')
  revalidatePath('/dashboard/feed')
  return {
    error: null,
    pr: isPr
      ? { benchmark: workout.title, rx, scoringType: workout.scoring_type, newScore: scoreValue, prevBest: prevBest as number }
      : null,
  }
}
