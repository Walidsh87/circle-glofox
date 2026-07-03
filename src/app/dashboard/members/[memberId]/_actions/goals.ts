'use server'

import { requireUserAction, type UserActionContext } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateGoal, type GoalInput } from '@/lib/goals'
import { skillByKey } from '@/lib/skill-bests'
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'

type Result = { error: string | null }
type AuthOk = { supabase: UserActionContext['supabase']; userId: string; boxId: string }

function revalidate() {
  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/goals')
}

// A goal can be managed by the athlete themselves OR by programming-tier staff
// (owner/admin/coach). RLS enforces the same on the row; this is the app-layer
// gate (clear errors + box binding). The per-row RLS policy is the real guard
// when a target id is passed (an athlete can only ever touch their own rows).
async function authForAthlete(athleteId: string): Promise<{ error: string } | AuthOk> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile) return { error: 'No profile found.' }
  const p = profile as { box_id: string; role: string }
  const isSelf = user.id === athleteId
  const isProgramming = (PROGRAMMING_ROLES as readonly string[]).includes(p.role)
  if (!isSelf && !isProgramming) return { error: 'Only coaches can set goals for a member.' }
  return { supabase, userId: user.id, boxId: p.box_id }
}

export async function setGoal(athleteId: string, input: GoalInput): Promise<Result> {
  const err = validateGoal(input)
  if (err) return { error: err }

  const auth = await authForAthlete(athleteId)
  if ('error' in auth) return { error: auth.error }
  const { supabase, userId, boxId } = auth

  const type = input.goalType as GoalInput['goalType']
  // skill_best targets split by measure: weight rides target_grams (kg → grams,
  // like lift_1rm); reps/meters/seconds ride target_count.
  const measure = type === 'skill_best' && input.skillKey ? skillByKey(input.skillKey)?.measure : undefined
  const row = {
    box_id: boxId,
    athlete_id: athleteId,
    created_by: userId,
    goal_type: type,
    title: input.title.trim(),
    lift_name: type === 'lift_1rm' ? (input.liftName ?? null) : null,
    target_grams:
      (type === 'lift_1rm' || measure === 'weight') && input.targetKg ? Math.round(input.targetKg * 1000) : null,
    skill_key: type === 'skill_best' ? (input.skillKey ?? null) : null,
    target_count:
      type === 'attendance' || (type === 'skill_best' && measure !== 'weight') ? (input.targetCount ?? null) : null,
    target_date: input.targetDate || null,
  }
  const { error } = await supabase.from('member_goals').insert(row)
  if (error) return actionError('setGoal', error)
  revalidate()
  return { error: null }
}

export async function setGoalStatus(goalId: string, status: 'active' | 'archived', athleteId: string): Promise<Result> {
  if (status !== 'active' && status !== 'archived') return { error: 'Invalid status.' }
  const auth = await authForAthlete(athleteId)
  if ('error' in auth) return { error: auth.error }
  const { supabase, boxId } = auth
  const { error } = await supabase.from('member_goals').update({ status }).eq('id', goalId).eq('box_id', boxId).eq('athlete_id', athleteId)
  if (error) return actionError('setGoalStatus', error)
  revalidate()
  return { error: null }
}

export async function markGoalDone(goalId: string, done: boolean, athleteId: string): Promise<Result> {
  const auth = await authForAthlete(athleteId)
  if ('error' in auth) return { error: auth.error }
  const { supabase, boxId } = auth
  const { error } = await supabase
    .from('member_goals')
    .update({ achieved_at: done ? new Date().toISOString() : null })
    .eq('id', goalId)
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
  if (error) return actionError('markGoalDone', error)
  revalidate()
  return { error: null }
}

export async function deleteGoal(goalId: string, athleteId: string): Promise<Result> {
  const auth = await authForAthlete(athleteId)
  if ('error' in auth) return { error: auth.error }
  const { supabase, boxId } = auth
  const { error } = await supabase.from('member_goals').delete().eq('id', goalId).eq('box_id', boxId).eq('athlete_id', athleteId)
  if (error) return actionError('deleteGoal', error)
  revalidate()
  return { error: null }
}
