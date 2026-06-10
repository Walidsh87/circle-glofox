import type { MembershipStatus } from '@/lib/membership-status'
import { lifecycleStage, stageHint, STAGES, type Stage } from '@/lib/lifecycle'

export type LeadRow = { id: string; full_name: string | null; source: string | null; status: 'new' | 'contacted' | 'converted' | 'lost' }

export type MemberRow = {
  athlete_id: string
  full_name: string
  membershipStatus: MembershipStatus
  isTrial: boolean
  riskTier: 'high' | 'medium' | 'none'
  riskScore: number
  daysSinceLastCheckIn: number | null
  daysUntilExpiry: number | null
  trialEndDate: string | null
}

export type Card = { id: string; kind: 'lead' | 'member'; href: string; name: string; hint: string }

type Sortable = { card: Card; score: number; trialEnd: string }

export function buildColumns(input: { leads: LeadRow[]; members: MemberRow[]; today: string }): Record<Stage, Card[]> {
  const tmp: Record<Stage, Sortable[]> = { lead: [], trial: [], active: [], at_risk: [], frozen: [], cancelled: [] }

  for (const l of input.leads) {
    const stage = lifecycleStage({ kind: 'lead', leadStatus: l.status })
    if (!stage) continue
    tmp[stage].push({
      card: { id: l.id, kind: 'lead', href: '/dashboard/members', name: l.full_name ?? 'Lead', hint: stageHint({ stage, leadSource: l.source }) },
      score: 0, trialEnd: '9999-99-99',
    })
  }

  for (const m of input.members) {
    const stage = lifecycleStage({ kind: 'member', membershipStatus: m.membershipStatus, isTrial: m.isTrial, riskTier: m.riskTier })
    if (!stage) continue
    tmp[stage].push({
      card: {
        id: m.athlete_id, kind: 'member', href: `/dashboard/members/${m.athlete_id}`, name: m.full_name,
        hint: stageHint({ stage, daysSinceLastCheckIn: m.daysSinceLastCheckIn, daysUntilExpiry: m.daysUntilExpiry, trialEndDate: m.trialEndDate }),
      },
      score: m.riskScore, trialEnd: m.trialEndDate ?? '9999-99-99',
    })
  }

  const out = {} as Record<Stage, Card[]>
  for (const stage of STAGES) {
    const list = tmp[stage]
    if (stage === 'at_risk') list.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
    else if (stage === 'trial') list.sort((a, b) => a.trialEnd.localeCompare(b.trialEnd) || a.card.name.localeCompare(b.card.name))
    else list.sort((a, b) => a.card.name.localeCompare(b.card.name))
    out[stage] = list.map((s) => s.card)
  }
  return out
}
