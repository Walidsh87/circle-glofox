import type { SupabaseClient } from '@supabase/supabase-js'
import { planChangeTitle, pendingPlanChangeTo } from '@/lib/plan-change'

// Member-JWT endpoint core for self-serve plan-change REQUESTS (#76, mobile). Deliberately
// request-based — never an instant switch (settled in the web #76 design: members could
// downgrade pre-renewal and Stripe billing would diverge). The request IS a follow_up_tasks
// row: it lands in the staff Follow-ups hub / member-profile card / dashboard due-count,
// and staff execute the actual change at the desk (existing ChangePlan + proration).
// Shared by the web requestPlanChange action (thin wrapper) and GET/POST /api/app/plan-change.
// Athletes have no RLS on membership_plans (owner-only) or follow_up_tasks (staff-only) —
// service client with every row pinned to box + self by the caller-forced ids.

export type PlanOption = { id: string; name: string; priceAed: number }
export type PlanChangeState = {
  plans: PlanOption[]
  pending: string | null // target plan name of the open request, if any
  currentPlanName: string | null
}

export async function getPlanChangeViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
): Promise<PlanChangeState> {
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: plans }, { data: memberships }, { data: openTasks }] = await Promise.all([
    service
      .from('membership_plans')
      .select('id, name, monthly_price_aed')
      .eq('box_id', boxId)
      .eq('active', true)
      .eq('is_trial', false)
      .order('monthly_price_aed'),
    service
      .from('memberships')
      .select('plan_name, end_date, start_date')
      .eq('athlete_id', athleteId)
      .eq('box_id', boxId)
      .order('start_date', { ascending: false }),
    service.from('follow_up_tasks').select('title').eq('box_id', boxId).eq('member_id', athleteId).eq('done', false),
  ])
  const current = ((memberships ?? []) as { plan_name: string; end_date: string | null }[]).find(
    (m) => !m.end_date || m.end_date >= today,
  )
  return {
    plans: ((plans ?? []) as { id: string; name: string; monthly_price_aed: number }[]).map((p) => ({
      id: p.id,
      name: p.name,
      priceAed: p.monthly_price_aed,
    })),
    pending: pendingPlanChangeTo(((openTasks ?? []) as { title: string }[]).map((t) => t.title)),
    currentPlanName: current?.plan_name ?? null,
  }
}

export type PlanChangeRequestResult =
  | { ok: true }
  | { ok: false; code: 'not_found' | 'validation_error' | 'conflict' | 'internal'; message: string }

// The rails, verbatim from the original web action (kept in ONE place now): plan must exist,
// be active, non-trial, in the caller's box; caller needs an active membership; no-op if
// already on the plan; one pending request max (dedup via the title contract).
export async function requestPlanChangeViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
  planId: string,
): Promise<PlanChangeRequestResult> {
  const { data: plan } = await service
    .from('membership_plans')
    .select('name, is_trial')
    .eq('id', planId)
    .eq('box_id', boxId)
    .eq('active', true)
    .maybeSingle()
  if (!plan) return { ok: false, code: 'not_found', message: 'Plan not found.' }
  if (plan.is_trial) return { ok: false, code: 'validation_error', message: "That plan isn't available." }

  const today = new Date().toISOString().slice(0, 10)
  const { data: memberships } = await service
    .from('memberships')
    .select('plan_name, end_date, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .order('start_date', { ascending: false })
  const current = ((memberships ?? []) as { plan_name: string; end_date: string | null }[]).find(
    (m) => !m.end_date || m.end_date >= today,
  )
  if (!current) return { ok: false, code: 'validation_error', message: 'No active membership — ask at the front desk.' }
  if (current.plan_name === plan.name) return { ok: false, code: 'validation_error', message: 'You are already on this plan.' }

  const { data: openTasks } = await service
    .from('follow_up_tasks')
    .select('title')
    .eq('box_id', boxId)
    .eq('member_id', athleteId)
    .eq('done', false)
  if (pendingPlanChangeTo(((openTasks ?? []) as { title: string }[]).map((t) => t.title))) {
    return { ok: false, code: 'conflict', message: 'You already have a pending request.' }
  }

  const { error } = await service.from('follow_up_tasks').insert({
    box_id: boxId,
    title: planChangeTitle(current.plan_name, plan.name as string),
    due_date: today,
    member_id: athleteId,
    created_by: athleteId,
    done: false,
  })
  if (error) {
    console.error('[requestPlanChangeViaApi] insert error:', error)
    return { ok: false, code: 'internal', message: 'Could not submit your request. Please try again.' }
  }
  return { ok: true }
}
