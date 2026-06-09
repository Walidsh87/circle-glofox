import type { MembershipStatus } from '@/lib/membership-status'
export type { MembershipStatus }
export type RiskInput = {
  daysSinceLastCheckIn: number | null // null = never checked in
  membershipStatus: MembershipStatus
  daysUntilExpiry: number | null      // null = no/open-ended active plan
  daysSinceJoined: number
}
export type RiskResult = { tier: 'high' | 'medium' | 'none'; score: number; reasons: string[] }

const GRACE_DAYS = 14
const EXPIRY_SOON_DAYS = 14

export function scoreMember(input: RiskInput): RiskResult {
  const { daysSinceLastCheckIn, membershipStatus, daysUntilExpiry, daysSinceJoined } = input

  // Too new to judge: joined recently and hasn't attended yet.
  if (daysSinceJoined < GRACE_DAYS && daysSinceLastCheckIn === null) {
    return { tier: 'none', score: 0, reasons: [] }
  }

  let score = 0
  const reasons: string[] = []

  if (daysSinceLastCheckIn === null) {
    score += 3; reasons.push('never checked in')
  } else if (daysSinceLastCheckIn >= 21) {
    score += 3; reasons.push(`away ${daysSinceLastCheckIn}d`)
  } else if (daysSinceLastCheckIn >= 14) {
    score += 2; reasons.push(`away ${daysSinceLastCheckIn}d`)
  } else if (daysSinceLastCheckIn >= 8) {
    score += 1; reasons.push(`away ${daysSinceLastCheckIn}d`)
  }

  if (membershipStatus === 'unpaid') {
    score += 2; reasons.push('unpaid')
  } else if (membershipStatus === 'no_membership') {
    score += 2; reasons.push('no active plan')
  } else if (daysUntilExpiry !== null && daysUntilExpiry <= EXPIRY_SOON_DAYS) {
    score += 1; reasons.push(`expires in ${daysUntilExpiry}d`)
  }

  const tier = score >= 3 ? 'high' : score === 2 ? 'medium' : 'none'
  return { tier, score, reasons }
}
