import { getMembershipStatus, isFrozenOn, type MembershipRow } from '@/lib/membership-status'

describe('getMembershipStatus', () => {
  const today = '2026-05-26'

  test('returns no_membership when memberships array is empty', () => {
    expect(getMembershipStatus([], today)).toBe('no_membership')
  })

  test('returns paid when one active paid membership exists', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: null }]
    expect(getMembershipStatus(rows, today)).toBe('paid')
  })

  test('returns unpaid when one active unpaid membership exists', () => {
    const rows = [{ payment_status: 'unpaid' as const, end_date: null }]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })

  test('returns unpaid when one expired paid and one active unpaid exist', () => {
    const rows = [
      { payment_status: 'paid' as const,   end_date: '2024-01-01' },
      { payment_status: 'unpaid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })

  test('returns unpaid when any active membership is unpaid (mixed)', () => {
    const rows = [
      { payment_status: 'paid' as const,   end_date: null },
      { payment_status: 'unpaid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })

  test('returns no_membership when all memberships are expired', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: '2024-01-01' }]
    expect(getMembershipStatus(rows, today)).toBe('no_membership')
  })

  // Scheduled cancellation: a future end_date is "active until then" — must keep
  // paid/active status (and stay selectable for undo), not be revoked early.
  test('returns paid when end_date is in the future (scheduled cancellation still active)', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: '2026-06-30' }]
    expect(getMembershipStatus(rows, today)).toBe('paid')
  })

  test('returns paid when end_date is exactly today (inclusive boundary)', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: today }]
    expect(getMembershipStatus(rows, today)).toBe('paid')
  })

  // Cross-module contract: the dunning webhook writes payment_status:'overdue'
  // (mig 014) — outside the narrowed paid|unpaid type — and getMembershipStatus
  // must treat any non-'paid' value as unpaid so an overdue member is blocked.
  test("treats a DB 'overdue' payment_status as unpaid (dunning contract)", () => {
    const rows = [{ payment_status: 'overdue', end_date: null } as unknown as MembershipRow]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })
})

describe('isFrozenOn', () => {
  const m = { frozen_from: '2026-06-01', frozen_until: '2026-07-01' }
  test('before window → false', () => expect(isFrozenOn(m, '2026-05-31')).toBe(false))
  test('inside window → true', () => expect(isFrozenOn(m, '2026-06-15')).toBe(true))
  test('on frozen_until → false (auto-resumed)', () => expect(isFrozenOn(m, '2026-07-01')).toBe(false))
  test('indefinite freeze → true for any date >= from', () =>
    expect(isFrozenOn({ frozen_from: '2026-06-01', frozen_until: null }, '2027-01-01')).toBe(true))
  test('no frozen_from → false', () => expect(isFrozenOn({}, '2026-06-15')).toBe(false))
})

describe('getMembershipStatus with freezes', () => {
  const today = '2026-06-15'
  test('all active memberships frozen → frozen', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: null, frozen_from: '2026-06-01', frozen_until: '2026-07-01' }]
    expect(getMembershipStatus(rows, today)).toBe('frozen')
  })
  test('a live paid membership alongside a frozen one → paid', () => {
    const rows = [
      { payment_status: 'paid' as const, end_date: null, frozen_from: '2026-06-01', frozen_until: '2026-07-01' },
      { payment_status: 'paid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('paid')
  })
  test('live unpaid alongside frozen → unpaid', () => {
    const rows = [
      { payment_status: 'paid' as const, end_date: null, frozen_from: '2026-06-01', frozen_until: '2026-07-01' },
      { payment_status: 'unpaid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })
})
