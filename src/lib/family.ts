// #84 on-behalf booking rail: a different target must be an athlete in the
// caller's own household. Self passes through with zero queries.
import type { SupabaseClient } from '@supabase/supabase-js'

export type BookingTarget = { targetId: string } | { error: string }

export async function resolveBookingTarget(
  supabase: SupabaseClient,
  userId: string,
  forAthleteId: string | null | undefined,
): Promise<BookingTarget> {
  if (!forAthleteId || forAthleteId === userId) return { targetId: userId }

  const { data: own } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  if (!own?.household_id) return { error: 'You are not part of a household.' }

  const { data: target } = await supabase.from('profiles').select('household_id, role').eq('id', forAthleteId).maybeSingle()
  if (!target || target.household_id !== own.household_id || target.role !== 'athlete') {
    return { error: 'That member is not in your household.' }
  }
  return { targetId: forAthleteId }
}
