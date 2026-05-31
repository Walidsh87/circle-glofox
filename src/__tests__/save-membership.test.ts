import { validateMembershipInput } from '@/app/dashboard/payments/_lib/validation'

describe('validateMembershipInput', () => {
  test('returns error when athleteId is missing', () => {
    const result = validateMembershipInput('', 'Basic', '2026-01-01')
    expect(result).toBe('Athlete, plan name, and start date are required.')
  })

  test('returns error when planName is empty', () => {
    const result = validateMembershipInput('athlete-123', '', '2026-01-01')
    expect(result).toBe('Athlete, plan name, and start date are required.')
  })

  test('returns error when planName is whitespace only', () => {
    const result = validateMembershipInput('athlete-123', '   ', '2026-01-01')
    expect(result).toBe('Athlete, plan name, and start date are required.')
  })

  test('returns error when startDate is missing', () => {
    const result = validateMembershipInput('athlete-123', 'Basic', '')
    expect(result).toBe('Athlete, plan name, and start date are required.')
  })

  test('returns null for valid input', () => {
    const result = validateMembershipInput('athlete-123', 'Basic', '2026-01-01')
    expect(result).toBeNull()
  })
})
