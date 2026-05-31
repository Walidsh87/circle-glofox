import { validateLiftInput } from '@/app/dashboard/lifts/_lib/validation'

describe('validateLiftInput', () => {
  test('returns error when liftName is empty', () => {
    const result = validateLiftInput('', 100)
    expect(result).toBe('Select a lift and enter a valid weight.')
  })

  test('returns error when weightKg is zero', () => {
    const result = validateLiftInput('back_squat', 0)
    expect(result).toBe('Select a lift and enter a valid weight.')
  })

  test('returns error when weightKg is negative', () => {
    const result = validateLiftInput('back_squat', -10)
    expect(result).toBe('Select a lift and enter a valid weight.')
  })

  test('returns error when weightKg is NaN', () => {
    const result = validateLiftInput('back_squat', NaN)
    expect(result).toBe('Select a lift and enter a valid weight.')
  })

  test('returns null for valid input', () => {
    const result = validateLiftInput('back_squat', 100)
    expect(result).toBeNull()
  })
})
