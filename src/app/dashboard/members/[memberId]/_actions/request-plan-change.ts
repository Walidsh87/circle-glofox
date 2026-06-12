'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { planChangeTitle, pendingPlanChangeTo } from '@/lib/plan-change'
import { revalidatePath } from 'next/cache'

export async function requestPlanChange(planId: string): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('role, box_id, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'athlete') return { error: 'Only members can request plan changes.' }

  // Athletes have no RLS on plans/tasks — service role with rows pinned to box + self.
  const service = createServiceClient()

  const { data: plan } = await service
    .from('membership_plans')
    .select('name, is_trial')
    .eq('id', planId)
    .eq('box_id', profile.box_id)
    .eq('active', true)
    .maybeSingle()
  if (!plan) return { error: 'Plan not found.' }
  if (plan.is_trial) return { error: "That plan isn't available." }

  const today = new Date().toISOString().slice(0, 10)
  const { data: memberships } = await service
    .from('memberships')
    .select('plan_name, end_date, start_date')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .order('start_date', { ascending: false })
  const current = (memberships ?? []).find((m) => !m.end_date || m.end_date >= today)
  if (!current) return { error: 'No active membership — ask at the front desk.' }
  if (current.plan_name === plan.name) return { error: 'You are already on this plan.' }

  const { data: openTasks } = await service
    .from('follow_up_tasks')
    .select('title')
    .eq('box_id', profile.box_id)
    .eq('member_id', user.id)
    .eq('done', false)
  if (pendingPlanChangeTo(((openTasks ?? []) as { title: string }[]).map((t) => t.title))) {
    return { error: 'You already have a pending request.' }
  }

  const { error } = await service.from('follow_up_tasks').insert({
    box_id: profile.box_id,
    title: planChangeTitle(current.plan_name, plan.name),
    due_date: today,
    member_id: user.id,
    created_by: user.id,
    done: false,
  })
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/members/${user.id}`)
  return { error: null }
}
