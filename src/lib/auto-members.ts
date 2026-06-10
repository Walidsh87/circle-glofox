import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import type { AutoMember } from '@/lib/automations'

type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

export async function loadAutoMembers(
  service: SupabaseClient,
  boxId: string,
  today: string
): Promise<{ members: AutoMember[]; tokenByAthlete: Map<string, string> }> {
  const [{ data: profiles }, { data: memberships }, { data: bookings }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, marketing_opt_out, created_at, date_of_birth, unsubscribe_token').eq('box_id', boxId).eq('role', 'athlete'),
    service.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until, is_trial').eq('box_id', boxId),
    service.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', boxId).eq('checked_in', true),
  ])

  const mByAthlete = new Map<string, MRow[]>()
  for (const m of (memberships ?? []) as MRow[]) {
    const arr = mByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    mByAthlete.set(m.athlete_id, arr)
  }

  const lastCheckIn = new Map<string, string>()
  for (const b of (bookings ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]) {
    const ci = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
    const startsAt = ci?.starts_at
    if (!startsAt || startsAt.slice(0, 10) >= today) continue
    const date = startsAt.slice(0, 10)
    const cur = lastCheckIn.get(b.athlete_id)
    if (!cur || date > cur) lastCheckIn.set(b.athlete_id, date)
  }

  const tokenByAthlete = new Map<string, string>()
  const members: AutoMember[] = ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null; created_at: string; date_of_birth: string | null; unsubscribe_token: string }[]).map((p) => {
    tokenByAthlete.set(p.id, p.unsubscribe_token)
    const rows = mByAthlete.get(p.id) ?? []
    const trialEnds = rows
      .filter((r) => r.is_trial === true && r.end_date && r.end_date >= today)
      .map((r) => r.end_date as string)
      .sort()
    return {
      athlete_id: p.id,
      email: p.email ?? null,
      full_name: p.full_name ?? '',
      marketing_opt_out: p.marketing_opt_out === true,
      created_at: p.created_at,
      date_of_birth: p.date_of_birth,
      membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
      trialEndDate: trialEnds[0] ?? null,
      lastCheckIn: lastCheckIn.get(p.id) ?? null,
    }
  })
  return { members, tokenByAthlete }
}
