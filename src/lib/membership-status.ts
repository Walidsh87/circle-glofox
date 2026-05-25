export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership'

export type MembershipRow = {
  payment_status: 'paid' | 'unpaid'
  end_date: string | null
}

export function getMembershipStatus(
  memberships: MembershipRow[],
  today: string
): MembershipStatus {
  const active = memberships.filter(
    (m) => m.end_date === null || m.end_date >= today
  )
  if (active.length === 0) return 'no_membership'
  if (active.some((m) => m.payment_status !== 'paid')) return 'unpaid'
  return 'paid'
}
