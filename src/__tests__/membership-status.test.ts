import { getMembershipStatus, isFrozenOn } from '@/lib/membership-status'

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
