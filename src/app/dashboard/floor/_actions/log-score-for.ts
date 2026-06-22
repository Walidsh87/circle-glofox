'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { decideWodPr } from '@/app/dashboard/wod/_lib/pr'
import type { WodPrInfo } from '@/app/dashboard/wod/_actions/log-score'

type State = { error: string | null; pr: WodPrInfo | null }

// Escape ILIKE wildcards so a title matches literally (mirrors logScore).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

// A coach logs a score ON BEHALF of an athlete. workout_scores write RLS is
// athlete-self, so this uses the service client AFTER a staff guard, and
// hand-scopes + box-verifies both the workout and the athlete.
export async function logScoreForAthlete(
  workoutId: string,
  athleteId: string,
  scoreValue: number,
  rx: boolean,
  notes: string | null,
): Promise<State> {
  if (!workoutId || !athleteId || !Number.isFinite(scoreValue) || scoreValue < 0) {
    return { error: 'Enter a valid score.', pr: null }
  }

  const auth = await requireStaffAction('Only staff can log scores.')
  if ('error' in auth) return { error: auth.error, pr: null }
  const { profile } = auth
  const boxId = profile.box_id

  const service = createServiceClient()

  // Box-verify the workout (and read its title/scoring for PR detection).
  const { data: workout } = await service
    .from('workouts')
    .select('title, scoring_type')
    .eq('id', workoutId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!workout) return { error: 'Workout not found.', pr: null }

  // Box-verify the athlete.
  const { data: athlete } = await service
    .from('profiles')
    .select('id')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!athlete) return { error: 'Member not found.', pr: null }

  const w = workout as { title: string; scoring_type: string }

  // Prior scores on the SAME benchmark (title, case-insensitive) + rx bracket for the TARGET athlete.
  const { data: priors } = await service
    .from('workout_scores')
    .select('score_value, workout_id, workouts!inner(title)')
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
    .eq('rx', rx)
    .ilike('workouts.title', escapeLike(w.title))
  const priorScores = ((priors ?? []) as { score_value: number; workout_id: string }[])
    .filter((p) => p.workout_id !== workoutId)
    .map((p) => p.score_value)

  // First-time score on a benchmark counts as a PR (athlete's own record).
  const isFirstTime = priorScores.length === 0
  const { isPr: isBetter, prevBest } = decideWodPr(w.scoring_type, scoreValue, priorScores)
  const isPr = isFirstTime || isBetter

  const { error } = await service.from('workout_scores').upsert(
    { box_id: boxId, workout_id: workoutId, athlete_id: athleteId, score_value: scoreValue, rx, notes: notes?.trim() || null, is_pr: isPr },
    { onConflict: 'workout_id,athlete_id' },
  )
  if (error) return { ...actionError('logScoreForAthlete', error), pr: null }

  revalidatePath('/dashboard/wod')
  revalidatePath('/dashboard/feed')
  revalidatePath('/dashboard/floor')
  return {
    error: null,
    pr: isPr ? { benchmark: w.title, rx, scoringType: w.scoring_type, newScore: scoreValue, prevBest: prevBest as number } : null,
  }
}
