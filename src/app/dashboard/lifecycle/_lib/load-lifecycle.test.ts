import { test, expect } from 'vitest'
import { buildColumns, type LeadRow, type MemberRow } from './load-lifecycle'

function mem(over: Partial<MemberRow>): MemberRow {
  return {
    athlete_id: 'a', full_name: 'A', membershipStatus: 'paid', isTrial: false,
    riskTier: 'none', riskScore: 0, daysSinceLastCheckIn: null, daysUntilExpiry: null, trialEndDate: null, ...over,
  }
}

test('buckets leads and members into the right columns', () => {
  const leads: LeadRow[] = [
    { id: 'l1', full_name: 'Lead One', source: 'Instagram', status: 'new' },
    { id: 'l2', full_name: 'Lost Lead', source: null, status: 'lost' },
  ]
  const members: MemberRow[] = [
    mem({ athlete_id: 'm1', full_name: 'Active Amy', membershipStatus: 'paid' }),
    mem({ athlete_id: 'm2', full_name: 'Trial Tom', isTrial: true, trialEndDate: '2026-06-20' }),
    mem({ athlete_id: 'm3', full_name: 'Frozen Fay', membershipStatus: 'frozen' }),
  ]
  const cols = buildColumns({ leads, members, today: '2026-06-09' })
  expect(cols.lead.map((c) => c.id)).toEqual(['l1'])      // lost dropped
  expect(cols.active.map((c) => c.id)).toEqual(['m1'])
  expect(cols.trial.map((c) => c.id)).toEqual(['m2'])
  expect(cols.frozen.map((c) => c.id)).toEqual(['m3'])
  expect(cols.cancelled).toEqual([])
})

test('member cards carry kind + profile href; leads link to the leads list', () => {
  const cols = buildColumns({
    leads: [{ id: 'l1', full_name: 'Lead One', source: 'Walk-in', status: 'contacted' }],
    members: [mem({ athlete_id: 'm1', full_name: 'Amy' })],
    today: '2026-06-09',
  })
  expect(cols.lead[0]).toMatchObject({ kind: 'lead', href: '/dashboard/members', hint: 'Walk-in' })
  expect(cols.active[0]).toMatchObject({ kind: 'member', href: '/dashboard/members/m1' })
})

test('at_risk is sorted by risk score descending', () => {
  const members: MemberRow[] = [
    mem({ athlete_id: 'low', full_name: 'Low', membershipStatus: 'paid', riskTier: 'high', riskScore: 3 }),
    mem({ athlete_id: 'high', full_name: 'High', membershipStatus: 'paid', riskTier: 'high', riskScore: 6 }),
  ]
  const cols = buildColumns({ leads: [], members, today: '2026-06-09' })
  expect(cols.at_risk.map((c) => c.id)).toEqual(['high', 'low'])
})

test('trial is sorted by soonest end date first', () => {
  const members: MemberRow[] = [
    mem({ athlete_id: 'later', full_name: 'Later', isTrial: true, trialEndDate: '2026-07-01' }),
    mem({ athlete_id: 'soon', full_name: 'Soon', isTrial: true, trialEndDate: '2026-06-12' }),
  ]
  const cols = buildColumns({ leads: [], members, today: '2026-06-09' })
  expect(cols.trial.map((c) => c.id)).toEqual(['soon', 'later'])
})
