import { validateCheckoutGuards } from '@/app/dashboard/payments/_lib/validation'

describe('validateCheckoutGuards', () => {
  test('returns error when membership is null', () => {
    const result = validateCheckoutGuards(null, true)
    expect(result).toBe('Membership not found.')
  })

  test('returns error when membership has no provider_plan_ref', () => {
    const result = validateCheckoutGuards({ provider_plan_ref: null }, true)
    expect(result).toBe('No payment plan linked to this membership.')
  })

  test('returns error when payment provider is not configured', () => {
    const result = validateCheckoutGuards({ provider_plan_ref: 'price_123' }, false)
    expect(result).toBe('Payment provider is not connected.')
  })

  test('returns null when membership and provider are configured', () => {
    const result = validateCheckoutGuards({ provider_plan_ref: 'price_123' }, true)
    expect(result).toBeNull()
  })
})
