import { validatePackageInput } from '@/app/dashboard/packages/_lib/validation'

describe('validatePackageInput', () => {
  test('accepts a valid class pack', () => {
    expect(validatePackageInput('10-Class Pack', 'class_pack', 10, 500, 60)).toBeNull()
  })
  test('accepts null expiry (never expires)', () => {
    expect(validatePackageInput('PT Block', 'pt_block', 5, 1000, null)).toBeNull()
  })
  test('accepts a zero price (free package)', () => {
    expect(validatePackageInput('Free Trial', 'class_pack', 1, 0, 30)).toBeNull()
  })
  test('rejects empty name', () => {
    expect(validatePackageInput('  ', 'class_pack', 10, 500, 60)).toMatch(/name/i)
  })
  test('rejects unknown type', () => {
    expect(validatePackageInput('X', 'membership', 10, 500, 60)).toMatch(/type/i)
  })
  test('rejects credit count below 1', () => {
    expect(validatePackageInput('X', 'class_pack', 0, 500, 60)).toMatch(/credit/i)
  })
  test('rejects non-integer credit count', () => {
    expect(validatePackageInput('X', 'class_pack', 2.5, 500, 60)).toMatch(/credit/i)
  })
  test('forces drop-in to exactly 1 credit', () => {
    expect(validatePackageInput('Drop-in', 'drop_in', 5, 75, null)).toMatch(/drop-in/i)
  })
  test('rejects negative price', () => {
    expect(validatePackageInput('X', 'class_pack', 10, -5, 60)).toMatch(/price/i)
  })
  test('rejects zero or negative expiry days', () => {
    expect(validatePackageInput('X', 'class_pack', 10, 500, 0)).toMatch(/expiry/i)
  })
})
