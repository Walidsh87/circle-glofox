import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import type { Candidate } from '@/lib/broadcast-audience'

/** A membership row as the broadcast/SMS candidate loaders select it. */
export type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

/** A `profiles` row as the candidate loaders select it (SMS also selects `phone`). */
type MemberRow = { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null }

/**
 * Group membership rows and tag rows by `athlete_id`. Shared by the broadcast,
 * SMS, and WhatsApp candidate loaders so the grouping (and the `MRow` shape it
 * depends on) can't drift between them.
 */
export function groupMembershipsAndTags(
  memberships: MRow[],
  tags: { athlete_id: string; tag: string }[],
): { mByAthlete: Map<string, MRow[]>; tagsByAthlete: Map<string, string[]> } {
  const mByAthlete = new Map<string, MRow[]>()
  for (const m of memberships) {
    const arr = mByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    mByAthlete.set(m.athlete_id, arr)
  }
  const tagsByAthlete = new Map<string, string[]>()
  for (const t of tags) {
    const arr = tagsByAthlete.get(t.athlete_id) ?? []
    arr.push(t.tag)
    tagsByAthlete.set(t.athlete_id, arr)
  }
  return { mByAthlete, tagsByAthlete }
}

/**
 * Fetch a box's membership + tag rows and return them grouped by athlete. The
 * broadcast and SMS loaders each fetch their own `profiles` row (the SMS one also
 * selects `phone`) and pair it with this; sharing the membership/tag query keeps
 * the two box-scoped reads identical.
 */
export async function loadGroupedMemberships(service: SupabaseClient, boxId: string) {
  const [{ data: memberships }, { data: tags }] = await Promise.all([
    service.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until, is_trial').eq('box_id', boxId),
    service.from('member_tags').select('athlete_id, tag').eq('box_id', boxId),
  ])
  return groupMembershipsAndTags(
    (memberships ?? []) as MRow[],
    (tags ?? []) as { athlete_id: string; tag: string }[],
  )
}

/**
 * Build the shared candidate fields from a member row and the grouped maps.
 * The SMS loader spreads this and adds `phone` — keeping the shape here stops
 * the broadcast and SMS loaders' candidate output from drifting apart.
 */
export function buildCandidateBase(
  member: MemberRow,
  mByAthlete: Map<string, MRow[]>,
  tagsByAthlete: Map<string, string[]>,
  today: string,
): Candidate {
  const rows = mByAthlete.get(member.id) ?? []
  const isTrial = rows.some((r) => (r.end_date === null || r.end_date >= today) && r.is_trial === true)
  return {
    athlete_id: member.id,
    email: member.email ?? null,
    full_name: member.full_name ?? '',
    marketing_opt_out: member.marketing_opt_out === true,
    membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
    isTrial,
    tags: tagsByAthlete.get(member.id) ?? [],
  }
}
