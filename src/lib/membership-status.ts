export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership' | 'frozen'

export type MembershipRow = {
  payment_status: 'paid' | 'unpaid'
  end_date: string | null
  frozen_from?: string | null
  frozen_until?: string | null
}

// Freeze window is [frozen_from, frozen_until): auto-resumes ON frozen_until.
// frozen_until null (with a frozen_from) = indefinite freeze until manually resumed.
export function isFrozenOn(
  m: { frozen_from?: string | null; frozen_until?: string | null },
  date: string,
): boolean {
  return !!m.frozen_from && m.frozen_from <= date && (m.frozen_until == null || date < m.frozen_until)
}

export function getMembershipStatus(
  memberships: MembershipRow[],
  today: string
): MembershipStatus {
  const active = memberships.filter(
    (m) => m.end_date === null || m.end_date >= today
  )
  if (active.length === 0) return 'no_membership'
  const live = active.filter((m) => !isFrozenOn(m, today))
  if (live.length === 0) return 'frozen'
  if (live.some((m) => m.payment_status !== 'paid')) return 'unpaid'
  return 'paid'
}
