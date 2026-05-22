import { validateStripePlanInput } from '@/app/dashboard/payments/_actions/create-stripe-plan'

describe('validateStripePlanInput', () => {
  test('returns error when planName is empty', () => {
    const result = validateStripePlanInput('', 199)
    expect(result).toBe('Plan name is required.')
  })

  test('returns error when planName is whitespace only', () => {
    const result = validateStripePlanInput('   ', 199)
    expect(result).toBe('Plan name is required.')
  })

  test('returns error when priceAed is zero', () => {
    const result = validateStripePlanInput('Basic Monthly', 0)
    expect(result).toBe('Enter a valid price.')
  })

  test('returns error when priceAed is negative', () => {
    const result = validateStripePlanInput('Basic Monthly', -50)
    expect(result).toBe('Enter a valid price.')
  })

  test('returns error when priceAed is NaN', () => {
    const result = validateStripePlanInput('Basic Monthly', NaN)
    expect(result).toBe('Enter a valid price.')
  })

  test('returns null for valid input', () => {
    const result = validateStripePlanInput('Basic Monthly', 199)
    expect(result).toBeNull()
  })
})
