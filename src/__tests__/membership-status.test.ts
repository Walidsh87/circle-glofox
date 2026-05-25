import { getMembershipStatus } from '@/lib/membership-status'

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
