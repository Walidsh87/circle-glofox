import type { MembershipStatus } from './membership-status'

export const TRIGGER_TYPES = ['no_checkin', 'trial_ending', 'joined', 'birthday'] as const
export type TriggerType = (typeof TRIGGER_TYPES)[number]

export type AutomationRule = {
  id: string
  trigger_type: TriggerType
  trigger_days: number | null
}

export type AutoMember = {
  athlete_id: string
  email: string | null
  full_name: string
  marketing_opt_out: boolean
  created_at: string            // ISO date or timestamp
  date_of_birth: string | null  // 'YYYY-MM-DD'
  membershipStatus: MembershipStatus
  trialEndDate: string | null   // soonest active trial end_date, else null
  lastCheckIn: string | null    // 'YYYY-MM-DD' of most recent checked-in booking, else null
}

export type Match = { athlete_id: string; fire_key: string }

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}

export function matchAutomation(rule: AutomationRule, members: AutoMember[], today: string): Match[] {
  const eligible = members.filter((m) => !m.marketing_opt_out && !!m.email)
  const days = rule.trigger_days ?? 0
  const out: Match[] = []
  for (const m of eligible) {
    switch (rule.trigger_type) {
      case 'joined':
        if (daysBetween(m.created_at, today) === days) out.push({ athlete_id: m.athlete_id, fire_key: 'joined' })
        break
      case 'trial_ending':
        if (m.trialEndDate && daysBetween(today, m.trialEndDate) === days) out.push({ athlete_id: m.athlete_id, fire_key: m.trialEndDate })
        break
      case 'birthday':
        if (m.date_of_birth && m.date_of_birth.slice(5, 10) === today.slice(5, 10)) out.push({ athlete_id: m.athlete_id, fire_key: today.slice(0, 4) })
        break
      case 'no_checkin': {
        if (m.membershipStatus !== 'paid') break
        const base = m.lastCheckIn ?? m.created_at.slice(0, 10)
        if (daysBetween(base, today) === days) {
          out.push({ athlete_id: m.athlete_id, fire_key: m.lastCheckIn ?? `none:${m.created_at.slice(0, 10)}` })
        }
        break
      }
    }
  }
  return out
}
