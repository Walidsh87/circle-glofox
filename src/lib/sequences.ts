import type { Block } from './email-blocks'
import type { AutoMember, TriggerType } from './automations'

export type SequenceStep = { offset_days: number; subject: string; body_blocks: Block[] }

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}

// The step to send next is index `sentCount` (steps go in order); due when its
// offset has elapsed. Returns null when nothing is due or all steps are sent.
export function nextDueStep(steps: SequenceStep[], enrolledOn: string, today: string, sentCount: number): number | null {
  if (sentCount >= steps.length) return null
  const elapsed = daysBetween(enrolledOn, today)
  return steps[sentCount].offset_days <= elapsed ? sentCount : null
}

export function enrollmentStillValid(
  triggerType: TriggerType,
  member: Pick<AutoMember, 'trialEndDate' | 'lastCheckIn'>,
  enrolledOn: string,
): boolean {
  switch (triggerType) {
    case 'joined':
    case 'birthday': return true
    case 'trial_ending': return member.trialEndDate !== null
    case 'no_checkin': return member.lastCheckIn == null || member.lastCheckIn <= enrolledOn
  }
}
