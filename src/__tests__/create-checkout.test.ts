import { validateCheckoutGuards } from '@/app/dashboard/payments/_actions/create-checkout'

describe('validateCheckoutGuards', () => {
  test('returns error when membership is null', () => {
    const result = validateCheckoutGuards(null, 'sk_test_123')
    expect(result).toBe('Membership not found.')
  })

  test('returns error when membership has no stripe_price_id', () => {
    const result = validateCheckoutGuards({ stripe_price_id: null }, 'sk_test_123')
    expect(result).toBe('No Stripe plan linked to this membership.')
  })

  test('returns error when stripe secret key is missing', () => {
    const result = validateCheckoutGuards({ stripe_price_id: 'price_123' }, null)
    expect(result).toBe('Stripe is not connected.')
  })

  test('returns null when membership and stripe key are present', () => {
    const result = validateCheckoutGuards({ stripe_price_id: 'price_123' }, 'sk_test_123')
    expect(result).toBeNull()
  })
})
