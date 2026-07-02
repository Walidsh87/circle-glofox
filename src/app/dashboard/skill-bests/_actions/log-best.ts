'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateBestInput, toStoredValue } from '@/lib/skill-bests'

// Athlete logs a new best for themselves (append-only — no update/delete UI in v1).
// RLS bests_self_manage enforces self + box on the row; box_id/athlete_id are still
// bound from the session here, never from input.
export async function logBest(skillKey: string, rawValue: string): Promise<{ error: string | null }> {
  const validationError = validateBestInput(skillKey, rawValue)
  if (validationError) return { error: validationError }

  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('box_id').eq('id', user.id).single()
  if (!profile) return { error: 'No profile found.' }

  const value = toStoredValue(skillKey, rawValue)
  if (value === null) return { error: 'Enter a valid value.' } // unreachable post-validate; belt & braces

  const { error } = await supabase.from('athlete_skill_bests').insert({
    box_id: (profile as { box_id: string }).box_id,
    athlete_id: user.id,
    skill_key: skillKey,
    value,
  })
  if (error) return actionError('logBest', error)

  revalidatePath('/dashboard/skill-bests')
  revalidatePath('/dashboard/goals')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
