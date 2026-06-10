export type Segment = 'all' | 'paid' | 'unpaid' | 'trial' | 'frozen'

export type Candidate = {
  athlete_id: string
  email: string | null
  full_name: string
  marketing_opt_out: boolean
  membershipStatus: 'paid' | 'unpaid' | 'no_membership' | 'frozen'
  isTrial: boolean
  tags: string[]
}

export type AudienceResult = {
  included: Candidate[]
  skippedOptedOut: Candidate[]
  skippedNoEmail: Candidate[]
}

export const SEGMENT_LABELS: Record<Segment, string> = {
  all: 'All members',
  paid: 'Paid members',
  unpaid: 'Unpaid members',
  trial: 'Trial members',
  frozen: 'Frozen members',
}

// 'all' reaches everyone (incl. trial). 'trial' reaches trial members only.
// paid/unpaid/frozen match the derived membership status and EXCLUDE trial
// members (a trial member is reachable only via 'trial'), mirroring KPI semantics.
export function matchesSegment(c: Candidate, status: Segment): boolean {
  if (status === 'all') return true
  if (status === 'trial') return c.isTrial
  if (c.isTrial) return false
  return c.membershipStatus === status
}

export function selectRecipients(
  candidates: Candidate[],
  opts: { status: Segment; tag: string | null },
): AudienceResult {
  const included: Candidate[] = []
  const skippedOptedOut: Candidate[] = []
  const skippedNoEmail: Candidate[] = []
  for (const c of candidates) {
    if (!matchesSegment(c, opts.status)) continue
    if (opts.tag && !c.tags.includes(opts.tag)) continue
    if (c.marketing_opt_out) { skippedOptedOut.push(c); continue }
    if (!c.email) { skippedNoEmail.push(c); continue }
    included.push(c)
  }
  return { included, skippedOptedOut, skippedNoEmail }
}
