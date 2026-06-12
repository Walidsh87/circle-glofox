import { validateAgreements, validateWaiverSignature } from '@/app/dashboard/sign-waiver/_lib/validation'

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

describe('validateAgreements', () => {
  test('requires waiver checkbox when not already signed', () => {
    expect(validateAgreements(false, true, 'Ahmed Ali', 'Ahmed Ali', false, false))
      .toBe('You must agree to the liability waiver.')
  })

  test('requires terms checkbox when not already signed', () => {
    expect(validateAgreements(true, false, 'Ahmed Ali', 'Ahmed Ali', false, false))
      .toBe('You must agree to the membership terms.')
  })

  test('skips waiver check when waiver already signed', () => {
    expect(validateAgreements(false, true, 'Ahmed Ali', 'Ahmed Ali', true, false)).toBeNull()
  })

  test('skips terms check when terms already signed', () => {
    expect(validateAgreements(true, false, 'Ahmed Ali', 'Ahmed Ali', false, true)).toBeNull()
  })

  test('returns null when nothing left to sign', () => {
    expect(validateAgreements(false, false, '', '', true, true)).toBeNull()
  })

  test('rejects mismatched name when at least one doc still needs signing', () => {
    expect(validateAgreements(true, true, 'Sara Hassan', 'Ahmed Ali', false, false))
      .toBe('Name does not match your registered name.')
  })

  test('accepts when both checked and name matches', () => {
    expect(validateAgreements(true, true, 'Ahmed Ali', 'Ahmed Ali', false, false)).toBeNull()
  })

  test('parqDue alone still requires the typed name', () => {
    expect(validateAgreements(false, false, '', 'Ahmed Ali', true, true, true))
      .toBe('Please type your full legal name.')
  })

  test('parqDue alone passes with a matching name', () => {
    expect(validateAgreements(false, false, 'Ahmed Ali', 'Ahmed Ali', true, true, true))
      .toBeNull()
  })

  test('both signed and no parq due needs nothing (back-compat)', () => {
    expect(validateAgreements(false, false, '', 'Ahmed Ali', true, true, false))
      .toBeNull()
  })
})
