import { test, expect } from 'vitest'
import { AUDIT_ACTION_LABELS, describeAuditDetails } from '@/lib/audit'

test('desk money actions have labels', () => {
  expect(AUDIT_ACTION_LABELS['desk.cash_recorded']).toBe('Cash recorded')
  expect(AUDIT_ACTION_LABELS['desk.payment_link']).toBe('Payment link')
  expect(AUDIT_ACTION_LABELS['desk.package_sold']).toBe('Package sold')
})

test('describeAuditDetails renders cash amount', () => {
  expect(describeAuditDetails('desk.cash_recorded', { plan: 'Unlimited', amount_aed: 300 })).toBe('AED 300 — Unlimited')
  expect(describeAuditDetails('desk.package_sold', { package: '10-pack' })).toBe('10-pack')
})
