import type { SupabaseClient } from '@supabase/supabase-js'
import { totalCheckins, currentStreakWeeks, crossedMilestone, reachedStreakLandmark } from '@/lib/consistency'

// Best-effort: record any milestone/streak landmark this check-in just crossed.
// The caller wraps this in try/catch — it must never break the check-in.
export async function awardConsistency(
  service: SupabaseClient,
  boxId: string,
  athleteId: string,
  today: string,
): Promise<void> {
  const { data: rows } = await service
    .from('bookings')
    .select('class_instances(starts_at)')
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
    .eq('checked_in', true)

  const dates = ((rows ?? []) as { class_instances: { starts_at: string } | { starts_at: string }[] | null }[])
    .map((r) => {
      const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
      return ci?.starts_at?.slice(0, 10) ?? null
    })
    .filter((d): d is string => d !== null)

  const awards: { box_id: string; athlete_id: string; kind: string; threshold: number }[] = []
  const m = crossedMilestone(totalCheckins(dates))
  if (m !== null) awards.push({ box_id: boxId, athlete_id: athleteId, kind: 'milestone', threshold: m })
  const s = reachedStreakLandmark(currentStreakWeeks(dates, today))
  if (s !== null) awards.push({ box_id: boxId, athlete_id: athleteId, kind: 'streak', threshold: s })

  if (awards.length === 0) return
  await service.from('member_achievements').upsert(awards, { onConflict: 'athlete_id,kind,threshold', ignoreDuplicates: true })
}
