'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateLiftInput } from '../_lib/validation'
import { detectPr } from '../_lib/pr'

export type PrInfo = { liftName: string; newKg: number; prevKg: number; deltaKg: number }
type State = { error: string | null; pr: PrInfo | null }

export async function saveLift(prevState: State, formData: FormData): Promise<State> {
  const liftName = formData.get('liftName') as string
  const weightKg = parseFloat(formData.get('weightKg') as string)

  const validationError = validateLiftInput(liftName, weightKg)
  if (validationError) return { error: validationError, pr: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', pr: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.', pr: null }

  // PR check: compare the new max against the athlete's current 1RM for this lift.
  const { data: prev } = await supabase
    .from('athlete_lifts')
    .select('one_rm_grams')
    .eq('athlete_id', user.id)
    .eq('lift_name', liftName)
    .maybeSingle()

  const newGrams = Math.round(weightKg * 1000)
  const previousGrams = prev ? prev.one_rm_grams : null
  const { isPr, deltaGrams } = detectPr(previousGrams, newGrams)
  const recordedOn = new Date().toISOString().slice(0, 10)

  // Current 1RM upsert — unchanged behavior (overwrites, even if the new value
  // is lower than the current; that pre-existing behavior is intentionally kept).
  const { error } = await supabase.from('athlete_lifts').upsert(
    {
      box_id: profile.box_id,
      athlete_id: user.id,
      lift_name: liftName,
      one_rm_grams: newGrams,
      recorded_on: recordedOn,
    },
    { onConflict: 'athlete_id,lift_name' }
  )

  if (error) return { error: error.message, pr: null }

  // The history row powers the chart marker and the activity feed, so a PR is
  // only "real" once it persists — otherwise we'd celebrate a PR that never
  // shows up anywhere. The 1RM itself is already saved regardless.
  const { error: histError } = await supabase.from('athlete_lifts_history').insert({
    box_id: profile.box_id,
    athlete_id: user.id,
    lift_name: liftName,
    one_rm_grams: newGrams,
    recorded_on: recordedOn,
    is_pr: isPr,
  })

  revalidatePath('/dashboard/lifts')
  revalidatePath('/dashboard/feed')
  return {
    error: null,
    pr: isPr && !histError ? { liftName, newKg: newGrams / 1000, prevKg: (previousGrams as number) / 1000, deltaKg: deltaGrams / 1000 } : null,
  }
}
