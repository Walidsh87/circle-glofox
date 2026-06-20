import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { groupMembershipsAndTags, type MRow } from '@/lib/broadcast-candidates'
import type { Candidate } from '@/lib/broadcast-audience'

export async function loadCandidates(
  service: SupabaseClient,
  boxId: string,
  today: string
): Promise<Candidate[]> {
  const [{ data: members }, { data: memberships }, { data: tags }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, marketing_opt_out').eq('box_id', boxId).eq('role', 'athlete'),
    service.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until, is_trial').eq('box_id', boxId),
    service.from('member_tags').select('athlete_id, tag').eq('box_id', boxId),
  ])

  const { mByAthlete, tagsByAthlete } = groupMembershipsAndTags(
    (memberships ?? []) as MRow[],
    (tags ?? []) as { athlete_id: string; tag: string }[],
  )

  return ((members ?? []) as { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null }[]).map((m) => {
    const rows = mByAthlete.get(m.id) ?? []
    const isTrial = rows.some((r) => (r.end_date === null || r.end_date >= today) && r.is_trial === true)
    return {
      athlete_id: m.id,
      email: m.email ?? null,
      full_name: m.full_name ?? '',
      marketing_opt_out: m.marketing_opt_out === true,
      membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
      isTrial,
      tags: tagsByAthlete.get(m.id) ?? [],
    }
  })
}
