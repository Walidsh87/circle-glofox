'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

type Result = { error: string | null }

function revalidate() {
  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/goals')
}

export async function addTrainingPlan(athleteId: string, title: string, body: string): Promise<Result> {
  if (!title.trim()) return { error: 'Give the plan a title.' }
  if (title.trim().length > 120) return { error: 'Title is too long (max 120 characters).' }
  if (body.length > 4000) return { error: 'Plan is too long (max 4000 characters).' }

  const auth = await requireProgrammingAction('Only coaches can assign training plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('member_training_plans').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    created_by: user.id,
    title: title.trim(),
    body: body.trim() || null,
    active: true,
  })
  if (error) return actionError('addTrainingPlan', error)
  revalidate()
  return { error: null }
}

export async function setPlanActive(planId: string, active: boolean, athleteId: string): Promise<Result> {
  const auth = await requireProgrammingAction('Only coaches can update training plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase
    .from('member_training_plans')
    .update({ active })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
    .eq('athlete_id', athleteId)
  if (error) return actionError('setPlanActive', error)
  revalidate()
  return { error: null }
}

export async function deleteTrainingPlan(planId: string, athleteId: string): Promise<Result> {
  const auth = await requireProgrammingAction('Only coaches can remove training plans.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase
    .from('member_training_plans')
    .delete()
    .eq('id', planId)
    .eq('box_id', profile.box_id)
    .eq('athlete_id', athleteId)
  if (error) return actionError('deleteTrainingPlan', error)
  revalidate()
  return { error: null }
}
