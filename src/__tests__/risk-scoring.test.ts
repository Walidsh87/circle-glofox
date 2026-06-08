import { scoreMember } from '@/app/dashboard/retention/_lib/risk'
import { lastCheckInByAthlete, daysBetween } from '@/app/dashboard/retention/_lib/aggregate'

describe('scoreMember', () => {
  test('new member who has never checked in is not judged (grace)', () => {
    expect(scoreMember({ daysSinceLastCheckIn: null, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 5 }))
      .toEqual({ tier: 'none', score: 0, reasons: [] })
  })
  test('never checked in past grace is high', () => {
    const r = scoreMember({ daysSinceLastCheckIn: null, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 40 })
    expect(r.tier).toBe('high')
    expect(r.reasons).toContain('never checked in')
  })
  test('away 18 days + unpaid is high with both reasons', () => {
    const r = scoreMember({ daysSinceLastCheckIn: 18, membershipStatus: 'unpaid', daysUntilExpiry: null, daysSinceJoined: 90 })
    expect(r.tier).toBe('high')
    expect(r.reasons).toEqual(['away 18d', 'unpaid'])
  })
  test('away 9 days but paid is below the threshold (none)', () => {
    expect(scoreMember({ daysSinceLastCheckIn: 9, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 90 }).tier).toBe('none')
  })
  test('away 14 days + paid is medium', () => {
    expect(scoreMember({ daysSinceLastCheckIn: 14, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 90 }).tier).toBe('medium')
  })
  test('recent but no active plan is medium', () => {
    const r = scoreMember({ daysSinceLastCheckIn: 2, membershipStatus: 'no_membership', daysUntilExpiry: null, daysSinceJoined: 90 })
    expect(r.tier).toBe('medium')
    expect(r.reasons).toEqual(['no active plan'])
  })
  test('paid but expiring soon adds an expiry reason', () => {
    const r = scoreMember({ daysSinceLastCheckIn: 10, membershipStatus: 'paid', daysUntilExpiry: 5, daysSinceJoined: 90 })
    expect(r.reasons).toContain('expires in 5d')
    expect(r.tier).toBe('medium') // away 8-13 (+1) + expiring (+1) = 2
  })
})

describe('daysBetween', () => {
  test('whole days from → to', () => {
    expect(daysBetween('2026-06-01', '2026-06-15')).toBe(14)
    expect(daysBetween('2026-06-01T10:00:00Z', '2026-06-02')).toBe(1)
  })
})

describe('lastCheckInByAthlete', () => {
  test('latest start strictly before now, per athlete; ignores future + null', () => {
    const m = lastCheckInByAthlete([
      { athlete_id: 'a', starts_at: '2026-06-01T06:00:00Z' },
      { athlete_id: 'a', starts_at: '2026-06-08T06:00:00Z' },
      { athlete_id: 'a', starts_at: '2026-06-30T06:00:00Z' }, // future
      { athlete_id: 'b', starts_at: null },
    ], '2026-06-10T06:00:00Z')
    expect(m.get('a')).toBe('2026-06-08T06:00:00Z')
    expect(m.has('b')).toBe(false)
  })
})
