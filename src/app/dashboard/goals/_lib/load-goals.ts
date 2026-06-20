import type { SupabaseClient } from '@supabase/supabase-js'
import { goalProgress, type Goal, type GoalProgress } from '@/lib/goals'

export type GoalWithProgress = Goal & { progress: GoalProgress }
export type TrainingPlan = { id: string; title: string; body: string | null; active: boolean; created_at: string }

// Loads a member's goals + training plans and derives each goal's progress from
// their current data (1RM / belt / attendance). Box-scoped; RLS additionally
// gates which client may read (staff_read / athlete_own). Shared by the member
// profile (staff or self) and the athlete /dashboard/goals page.
export async function loadGoalsData(
  supabase: SupabaseClient,
  athleteId: string,
  boxId: string,
): Promise<{ goals: GoalWithProgress[]; plans: TrainingPlan[] }> {
  const [{ data: goalRows }, { data: planRows }, { data: liftRows }, { data: skillRows }] = await Promise.all([
    supabase.from('member_goals').select('*').eq('athlete_id', athleteId).eq('box_id', boxId).order('created_at', { ascending: false }),
    supabase
      .from('member_training_plans')
      .select('id, title, body, active, created_at')
      .eq('athlete_id', athleteId)
      .eq('box_id', boxId)
      .order('created_at', { ascending: false }),
    supabase.from('athlete_lifts').select('lift_name, one_rm_grams').eq('athlete_id', athleteId).eq('box_id', boxId),
    supabase.from('skill_levels').select('skill_key, belt').eq('athlete_id', athleteId).eq('box_id', boxId),
  ])

  const allGoals = (goalRows ?? []) as Goal[]
  const lifts = new Map<string, number>()
  for (const r of (liftRows ?? []) as { lift_name: string; one_rm_grams: number }[]) lifts.set(r.lift_name, r.one_rm_grams)
  const belts = new Map<string, string>()
  for (const r of (skillRows ?? []) as { skill_key: string; belt: string }[]) belts.set(r.skill_key, r.belt)

  // Only query check-ins when an attendance goal needs them, bounded by the
  // earliest such goal's start — avoids a full booking history scan otherwise.
  const attendanceGoals = allGoals.filter((g) => g.goal_type === 'attendance')
  let checkins: string[] = []
  if (attendanceGoals.length > 0) {
    const earliest = attendanceGoals.reduce((min, g) => (g.created_at < min ? g.created_at : min), attendanceGoals[0].created_at)
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('checked_in_at')
      .eq('athlete_id', athleteId)
      .eq('box_id', boxId)
      .eq('checked_in', true)
      .gte('checked_in_at', earliest)
    checkins = ((bookingRows ?? []) as { checked_in_at: string | null }[]).map((b) => b.checked_in_at).filter((t): t is string => !!t)
  }

  const goals = allGoals.map((g) => {
    let attendanceCount: number | undefined
    if (g.goal_type === 'attendance') {
      const end = g.target_date ? g.target_date + 'T23:59:59Z' : null
      attendanceCount = checkins.filter((t) => t >= g.created_at && (!end || t <= end)).length
    }
    return {
      ...g,
      progress: goalProgress(g, {
        liftGrams: g.lift_name ? (lifts.get(g.lift_name) ?? null) : null,
        belt: g.skill_key ? (belts.get(g.skill_key) ?? null) : null,
        attendanceCount,
      }),
    }
  })

  return { goals, plans: (planRows ?? []) as TrainingPlan[] }
}
