import type { MembershipStatus } from './membership-status'

export type Stage = 'lead' | 'trial' | 'active' | 'at_risk' | 'frozen' | 'cancelled'

export const STAGES: Stage[] = ['lead', 'trial', 'active', 'at_risk', 'frozen', 'cancelled']

export type LifecyclePerson = {
  kind: 'lead' | 'member'
  leadStatus?: 'new' | 'contacted' | 'converted' | 'lost'
  membershipStatus?: MembershipStatus
  isTrial?: boolean
  riskTier?: 'high' | 'medium' | 'none'
}

export function lifecycleStage(p: LifecyclePerson): Stage | null {
  if (p.kind === 'lead') {
    return p.leadStatus === 'new' || p.leadStatus === 'contacted' ? 'lead' : null
  }
  if (p.membershipStatus === 'frozen') return 'frozen'
  if (p.membershipStatus === 'no_membership') return 'cancelled'
  if (p.isTrial) return 'trial'
  if (p.membershipStatus === 'unpaid' || p.riskTier === 'high') return 'at_risk'
  return 'active'
}

export type StageHintInput = {
  stage: Stage
  daysSinceLastCheckIn?: number | null
  daysUntilExpiry?: number | null
  trialEndDate?: string | null
  leadSource?: string | null
}

export function stageHint(input: StageHintInput): string {
  switch (input.stage) {
    case 'lead': return input.leadSource?.trim() ? input.leadSource : 'new lead'
    case 'trial': return input.trialEndDate ? `trial ends ${input.trialEndDate}` : 'on trial'
    case 'at_risk': return input.daysSinceLastCheckIn == null ? 'never checked in' : `away ${input.daysSinceLastCheckIn}d`
    case 'frozen': return 'frozen'
    case 'cancelled': return 'no active plan'
    case 'active': return input.daysUntilExpiry != null && input.daysUntilExpiry <= 14 ? `expires in ${input.daysUntilExpiry}d` : ''
  }
}
