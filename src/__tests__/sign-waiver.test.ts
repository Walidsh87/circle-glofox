import { validateWaiverSignature } from '@/app/dashboard/sign-waiver/_actions/sign-waiver'

describe('validateWaiverSignature', () => {
  test('returns error when checkbox is unchecked', () => {
    const result = validateWaiverSignature(false, 'Ahmed Ali', 'Ahmed Ali')
    expect(result).toBe('You must check the box to agree.')
  })

  test('returns error when typed name is empty', () => {
    const result = validateWaiverSignature(true, '', 'Ahmed Ali')
    expect(result).toBe('Please type your full legal name.')
  })

  test('returns error when profile name is missing', () => {
    const result = validateWaiverSignature(true, 'Ahmed Ali', '')
    expect(result).toBe('Your profile name is missing. Contact your gym owner.')
  })

  test('returns error when typed name does not match profile name', () => {
    const result = validateWaiverSignature(true, 'Ahmed Ali', 'Sara Hassan')
    expect(result).toBe('Name does not match your registered name.')
  })

  test('returns null when name matches exactly', () => {
    const result = validateWaiverSignature(true, 'Ahmed Ali', 'Ahmed Ali')
    expect(result).toBeNull()
  })

  test('returns null when name matches case-insensitively', () => {
    const result = validateWaiverSignature(true, 'ahmed ali', 'Ahmed Ali')
    expect(result).toBeNull()
  })
})
