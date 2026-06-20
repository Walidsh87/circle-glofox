import type { MembershipRow } from '@/lib/membership-status'

/** A membership row as the broadcast/SMS candidate loaders select it. */
export type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

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
